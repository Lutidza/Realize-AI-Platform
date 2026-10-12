/**
 * @file packages/payload-extension-manager/src/server/AdminShell.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Авторизует независимый shell lifecycle и атомарно проверяет template dependency.
 * @see documentation/specifications/extension-management.md
 */
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { isTemplateSettings } from "@realize/template-contracts";
import type { ResolvedExtensionManagerOptions } from "../ExtensionManagerOptions.types";
import type { ExtensionAppearanceStore } from "../appearance/ExtensionAppearance.types";
import type { ExtensionStateDependency } from "../persistence/ExtensionStatePersistence.types";
import type {
  AdminShellAppearance,
  AdminShellMode,
  AdminShellStore,
  AdminShellSnapshotDto,
} from "../admin-shell/AdminShell.types";
import { createAdminShellStore } from "../admin-shell/createAdminShellStore.util";
import { hashAdminShellPolicy } from "../admin-shell/hashAdminShellPolicy.server";
import { mapAdminShellReceipt } from "../admin-shell/mapAdminShellReceipt.mapper";
import { prepareAdminShell } from "../admin-shell/prepareAdminShell.service";
import { previewAdminShell } from "../admin-shell/previewAdminShell.service";
import { applyAdminShell } from "../admin-shell/applyAdminShell.service";
import {
  prepareAdminShellSchema,
  applyAdminShellSchema,
} from "../admin-shell/adminShell.schemas";
import { extensionRequestIdSchema } from "../appearance/extensionAppearance.schemas";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import { ExtensionAppearanceRepository } from "../persistence/ExtensionAppearance.repository";
import { extensionAppearanceStateCodec } from "../persistence/extensionAppearanceStateCodec.validator";
import { ExtensionManagerService } from "./ExtensionManager.service";
import { ExtensionManagerHttpError } from "./ExtensionManagerHttp.error";
import { resolveAdminShellPolicy } from "./resolveAdminShellPolicy.service";
import {
  createAdminShellRepository,
  adminShellScope,
} from "./createAdminShellRepository.service";
import { createExtensionRuntimeState } from "./createExtensionRuntimeState.service";

/** Same ACL as appearance; scope/actor не принимаются из пользовательского JSON. */
export class AdminShellService {
  private readonly authorization: ExtensionManagerService;
  private readonly repository: ReturnType<typeof createAdminShellRepository>;
  constructor(
    private readonly req: PayloadRequest,
    private readonly options: ResolvedExtensionManagerOptions,
  ) {
    this.authorization = new ExtensionManagerService(req, options);
    this.repository = createAdminShellRepository(req.payload);
  }
  authorize(action: "read" | "appearance" = "read") {
    return this.authorization.authorize(action);
  }
  private async current() {
    const policy = await resolveAdminShellPolicy(this.options);
    const bootstrap = createAdminShellStore(policy);
    const stored = await this.repository.read(
      adminShellScope(this.options.scopeKey),
    );
    return { policy, bootstrap, stored, store: stored.store ?? bootstrap };
  }
  async snapshot(): Promise<AdminShellSnapshotDto> {
    await this.authorize();
    const { policy, store, stored } = await this.current();
    return {
      policy,
      policyHash: hashAdminShellPolicy(policy),
      state: store.state,
      storage: stored.storageReady ? "ready" : "requires_schema",
      history: store.receipts.flatMap((receipt) =>
        receipt.kind === "apply" ? [mapAdminShellReceipt(receipt)] : [],
      ),
      permissions: {
        manageShell: Boolean(
          await this.options.access.canManageAppearance({ req: this.req }),
        ),
      },
    };
  }
  async prepare(input: unknown, requestId: string) {
    const actorKey = await this.authorize("appearance");
    this.assertId(requestId);
    if (!isTemplateSettings(input))
      throw new ExtensionManagerError("INVALID_INPUT");
    const parsed = prepareAdminShellSchema.safeParse(input);
    if (!parsed.success) throw new ExtensionManagerError("INVALID_INPUT");
    const current = await this.current();
    this.assertStorage(current.stored.storageReady);
    const mode =
      parsed.data.action === "select"
        ? parsed.data.mode
        : current.store.state.previous;
    return this.mutate(
      current,
      mode,
      actorKey,
      requestId,
      "prepare",
      async (store, appearance) => {
        const result = prepareAdminShell({
          store,
          policy: current.policy,
          appearance,
          actorKey,
          requestId,
          input: parsed.data,
          planId: randomUUID(),
          nowMs: Date.now(),
        });
        return {
          store: result.store,
          result: { plan: result.plan, replayed: result.replayed },
        };
      },
    );
  }
  async apply(input: unknown, requestId: string) {
    const actorKey = await this.authorize("appearance");
    this.assertId(requestId);
    if (!isTemplateSettings(input))
      throw new ExtensionManagerError("INVALID_INPUT");
    const parsed = applyAdminShellSchema.safeParse(input);
    if (!parsed.success) throw new ExtensionManagerError("INVALID_INPUT");
    const current = await this.current();
    this.assertStorage(current.stored.storageReady);
    const mode =
      current.store.plans.find((plan) => plan.id === parsed.data.planId)
        ?.desiredMode ?? null;
    return this.mutate(
      current,
      mode,
      actorKey,
      requestId,
      "apply",
      async (store, appearance) => {
        const result = applyAdminShell({
          store,
          policy: current.policy,
          appearance,
          actorKey,
          requestId,
          input: parsed.data,
          nowMs: Date.now(),
        });
        return {
          store: result.store,
          result: { receipt: result.receipt, replayed: result.replayed },
        };
      },
    );
  }
  async preview(planId: string) {
    const actorKey = await this.authorize("appearance");
    this.assertId(planId);
    const { policy, store, stored } = await this.current();
    this.assertStorage(stored.storageReady);
    const plan = store.plans.find((candidate) => candidate.id === planId);
    let appearance = null;
    if (plan?.desiredMode === "template") {
      const runtime = await createExtensionRuntimeState(this.options);
      const state = await new ExtensionAppearanceRepository(
        this.req.payload,
      ).read(this.options.scopeKey);
      this.assertStorage(state.storageReady);
      appearance = {
        store: state.store ?? runtime.bootstrapStore,
        catalog: runtime.catalog,
      };
    }
    return previewAdminShell({
      store,
      policy,
      appearance,
      actorKey,
      planId,
      nowMs: Date.now(),
    });
  }
  private async mutate<Result>(
    current: Awaited<ReturnType<AdminShellService["current"]>>,
    mode: AdminShellMode | null,
    actorKey: string,
    requestId: string,
    kind: "prepare" | "apply",
    operation: (
      store: AdminShellStore,
      appearance: AdminShellAppearance | null,
    ) => Promise<{
      store: AdminShellStore;
      result: Result;
    }>,
  ) {
    let runtimePromise:
      ReturnType<typeof createExtensionRuntimeState> | undefined;
    const runtime = () =>
      (runtimePromise ??= createExtensionRuntimeState(this.options));
    const dependencies: Record<
      string,
      ExtensionStateDependency<ExtensionAppearanceStore>
    > = mode === "template"
      ? {
          appearance: {
            scopeKey: this.options.scopeKey,
            codec: extensionAppearanceStateCodec,
            bootstrap: async () => (await runtime()).bootstrapStore,
          },
        }
      : {};
    return this.repository.mutate(
      this.req,
      adminShellScope(this.options.scopeKey),
      current.bootstrap,
      async (store, dependencies) => {
        await this.authorize("appearance");
        const replay = store.receipts.some(
          (receipt) =>
            receipt.kind === kind &&
            receipt.actorKey === actorKey &&
            receipt.requestId === requestId,
        );
        if (
          !replay &&
          hashAdminShellPolicy(await resolveAdminShellPolicy(this.options)) !==
            hashAdminShellPolicy(current.policy)
        )
          throw new ExtensionManagerError("POLICY_CHANGED");
        const appearance =
          !replay && mode === "template" && dependencies.appearance
            ? {
                store: dependencies.appearance,
                catalog: (await runtime()).catalog,
              }
            : null;
        return operation(store, appearance);
      },
      { actorKey, requestId, kind },
      dependencies,
    );
  }
  private assertId(value: string) {
    if (!extensionRequestIdSchema.safeParse(value).success)
      throw new ExtensionManagerHttpError("INVALID_REQUEST");
  }
  private assertStorage(ready: boolean) {
    if (!ready) throw new ExtensionManagerHttpError("SCHEMA_REQUIRED");
  }
}
