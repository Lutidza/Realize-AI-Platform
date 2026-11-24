/**
 * @file packages/payload-extension-manager/src/server/ExtensionManager.service.ts
 * @version 1.1.0
 * @date 2026-11-18
 * @description Авторизует каталог и appearance планы; новый код не попадает в ложную install очередь.
 * @see documentation/specifications/extension-management.md
 */
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { z } from "zod";
import {
  applyExtensionAppearance,
  prepareExtensionAppearance,
  previewExtensionAppearance,
} from "../appearance/extensionAppearance.server.index";
import {
  extensionRequestIdSchema,
  extensionHashSchema,
} from "../appearance/extensionAppearance.schemas";
import { mapExtensionCatalog } from "../catalog/mapExtensionCatalog.mapper";
import { mapExtensionAppearanceReceipt } from "../appearance/mapExtensionAppearanceReceipt.mapper";
import type { ExtensionApplyReceipt } from "../appearance/ExtensionAppearance.types";
import type {
  ExtensionApplyResponseDto,
  ExtensionManagerSnapshotDto,
  ExtensionPrepareResponseDto,
} from "../ExtensionManager.types";
import type { ResolvedExtensionManagerOptions } from "../ExtensionManagerOptions.types";
import { ExtensionAppearanceRepository } from "../persistence/ExtensionAppearance.repository";
import { createExtensionRuntimeState } from "./createExtensionRuntimeState.service";
import { ExtensionManagerHttpError } from "./ExtensionManagerHttp.error";

const installRequest = z.strictObject({
  templateId: z.string().min(1).max(100),
  templateVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  expectedCatalogHash: extensionHashSchema,
});

/** Доступ и identity определяются req/host; actor и scope не принимаются из JSON. */
export class ExtensionManagerService {
  private readonly repository: ExtensionAppearanceRepository;
  constructor(
    private readonly req: PayloadRequest,
    private readonly options: ResolvedExtensionManagerOptions,
  ) {
    this.repository = new ExtensionAppearanceRepository(req.payload);
  }

  async authorize(action: "read" | "appearance" | "install" = "read") {
    const user = this.req.user;
    if (!user) throw new ExtensionManagerHttpError("UNAUTHENTICATED");
    const allowed =
      action === "read"
        ? this.options.access.canReadCatalog
        : action === "appearance"
          ? this.options.access.canManageAppearance
          : this.options.access.canInstallCode;
    if (
      user.collection !== this.options.userCollection ||
      !(await allowed({ req: this.req }))
    )
      throw new ExtensionManagerHttpError("FORBIDDEN");
    return `${user.collection}:${String(user.id)}`;
  }

  async snapshot(): Promise<ExtensionManagerSnapshotDto> {
    await this.authorize();
    const { catalog, bootstrapStore } = await createExtensionRuntimeState(
      this.options,
    );
    const stored = await this.repository.read(this.options.scopeKey);
    const state = stored.store ?? bootstrapStore;
    return {
      catalog: mapExtensionCatalog(catalog),
      storage: stored.storageReady ? "ready" : "requires_schema",
      targets: {
        admin: state.targets.admin,
        frontend: state.targets.frontend,
      },
      history: state.receipts
        .filter(
          (receipt): receipt is ExtensionApplyReceipt =>
            receipt.kind === "apply",
        )
        .map(mapExtensionAppearanceReceipt),
      permissions: {
        manageAppearance: Boolean(
          await this.options.access.canManageAppearance({ req: this.req }),
        ),
        installCode: Boolean(
          await this.options.access.canInstallCode({ req: this.req }),
        ),
      },
      codeInstallation: {
        ready: false,
        reason: "DELIVERY_ADAPTER_UNAVAILABLE",
      },
    };
  }

  async prepare(
    input: unknown,
    requestId: string,
  ): Promise<ExtensionPrepareResponseDto> {
    const actorKey = await this.authorize("appearance");
    this.assertRequestId(requestId);
    const { catalog, bootstrapStore } = await createExtensionRuntimeState(
      this.options,
    );
    await this.assertStorage();
    return this.repository.mutate(
      this.req,
      this.options.scopeKey,
      bootstrapStore,
      async (store) => {
        await this.authorize("appearance");
        const result = prepareExtensionAppearance({
          // Включение записи требует отдельной подтверждённой доставки readers и rollback build.
          layoutAssignmentWrites: "disabled",
          store,
          catalog,
          actorKey,
          requestId,
          input,
          planId: randomUUID(),
          nowMs: Date.now(),
        });
        return {
          store: result.store,
          result: { plan: result.plan, replayed: result.replayed },
        };
      },
      { actorKey, requestId, kind: "prepare" },
    );
  }

  async preview(planId: string) {
    const actorKey = await this.authorize("appearance");
    this.assertRequestId(planId);
    const { catalog, bootstrapStore } = await createExtensionRuntimeState(
      this.options,
    );
    const stored = await this.repository.read(this.options.scopeKey);
    if (!stored.storageReady)
      throw new ExtensionManagerHttpError("SCHEMA_REQUIRED");
    return previewExtensionAppearance({
      store: stored.store ?? bootstrapStore,
      catalog,
      actorKey,
      planId,
      nowMs: Date.now(),
    });
  }

  async apply(
    input: unknown,
    requestId: string,
  ): Promise<ExtensionApplyResponseDto> {
    const actorKey = await this.authorize("appearance");
    this.assertRequestId(requestId);
    const { catalog, bootstrapStore } = await createExtensionRuntimeState(
      this.options,
    );
    await this.assertStorage();
    return this.repository.mutate(
      this.req,
      this.options.scopeKey,
      bootstrapStore,
      async (store) => {
        await this.authorize("appearance");
        const result = applyExtensionAppearance({
          layoutAssignmentWrites: "disabled",
          store,
          catalog,
          actorKey,
          requestId,
          input,
          nowMs: Date.now(),
        });
        return {
          store: result.store,
          result: { receipt: result.receipt, replayed: result.replayed },
        };
      },
      { actorKey, requestId, kind: "apply" },
    );
  }

  async install(input: unknown): Promise<never> {
    await this.authorize("install");
    const parsed = installRequest.safeParse(input);
    if (!parsed.success) throw new ExtensionManagerHttpError("INVALID_REQUEST");
    // Никакой job/операции не создаётся, пока host не имеет trusted extension delivery adapter.
    throw new ExtensionManagerHttpError("DELIVERY_ADAPTER_UNAVAILABLE");
  }

  private assertRequestId(value: string) {
    if (!extensionRequestIdSchema.safeParse(value).success)
      throw new ExtensionManagerHttpError("INVALID_REQUEST");
  }
  private async assertStorage() {
    if (!(await this.repository.read(this.options.scopeKey)).storageReady)
      throw new ExtensionManagerHttpError("SCHEMA_REQUIRED");
  }
}
