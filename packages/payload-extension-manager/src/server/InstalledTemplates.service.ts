/**
 * @file packages/payload-extension-manager/src/server/InstalledTemplates.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Собирает ACL-protected inventory из текущего runtime и typed repositories без writes.
 * @see documentation/specifications/extension-management.md
 */
import type { PayloadRequest } from "payload";
import { isTemplateSettings } from "@realize/template-contracts";
import type { ResolvedExtensionManagerOptions } from "../ExtensionManagerOptions.types";
import type { InstalledTemplatesSnapshotDto } from "../installed-templates/InstalledTemplates.types";
import { mapInstalledTemplatesSnapshot } from "../installed-templates/mapInstalledTemplatesSnapshot.mapper";
import { installedTemplateRuntimeReceiptSchema } from "../installed-templates/installedTemplates.schemas";
import { ExtensionAppearanceRepository } from "../persistence/ExtensionAppearance.repository";
import { createAdminShellStore } from "../admin-shell/createAdminShellStore.util";
import { readAdminShellState } from "../admin-shell/readAdminShellState.service";
import { createExtensionRuntimeState } from "./createExtensionRuntimeState.service";
import { resolveStoredExtensionAssignment } from "./resolveStoredExtensionAssignment.service";
import { resolveAdminShellPolicy } from "./resolveAdminShellPolicy.service";
import {
  adminShellScope,
  createAdminShellRepository,
} from "./createAdminShellRepository.service";
import { ExtensionManagerService } from "./ExtensionManager.service";

/** Сервис авторизует до runtime metadata/SQL; saved selection и effective shell не смешиваются. */
export class InstalledTemplatesService {
  private readonly access: ExtensionManagerService;
  constructor(
    private readonly req: PayloadRequest,
    private readonly options: ResolvedExtensionManagerOptions,
  ) {
    this.access = new ExtensionManagerService(req, options);
  }
  authorize() {
    return this.access.authorize("read");
  }
  async snapshot(): Promise<InstalledTemplatesSnapshotDto> {
    await this.authorize();
    const { catalog, bootstrapStore } = await createExtensionRuntimeState(
      this.options,
    );
    const appearance = await new ExtensionAppearanceRepository(
      this.req.payload,
    ).read(this.options.scopeKey);
    const store = appearance.store ?? bootstrapStore;
    const resolve = (target: "admin" | "frontend") =>
      resolveStoredExtensionAssignment({
        catalog,
        target,
        current: store.targets[target].current,
        fallback: bootstrapStore.targets[target].current,
      });
    const admin = resolve("admin");
    const frontend = resolve("frontend");
    const policy = this.options.adminShell
      ? await resolveAdminShellPolicy(this.options)
      : null;
    const shell = policy
      ? await createAdminShellRepository(this.req.payload).read(
          adminShellScope(this.options.scopeKey),
        )
      : null;
    const shellState = policy
      ? readAdminShellState({
          policy,
          store: shell?.store ?? createAdminShellStore(policy),
          appearance: { store, catalog },
        })
      : null;
    const rawReceipt = (await this.options.runtimeInstallation?.()) ?? null;
    // Callback принадлежит host, но malformed/accessor metadata не превращается в подтверждение установки.
    const parsedReceipt = isTemplateSettings(rawReceipt)
      ? installedTemplateRuntimeReceiptSchema.safeParse(rawReceipt)
      : null;
    const receipt = parsedReceipt?.success ? parsedReceipt.data : null;
    return mapInstalledTemplatesSnapshot({
      catalog,
      store,
      bootstrapStore,
      policy,
      selectedShellMode: shellState?.state.current ?? null,
      shellMode: shellState?.effectiveMode ?? null,
      assignmentByTarget: {
        admin: admin.assignment,
        frontend: frontend.assignment,
      },
      requiresRecovery: [
        ...(admin.requiresRecovery ? ["admin" as const] : []),
        ...(frontend.requiresRecovery ? ["frontend" as const] : []),
      ],
      runtime: receipt
        ? { ...receipt, catalogHash: catalog.catalogHash }
        : null,
      storageReady: appearance.storageReady && (shell?.storageReady ?? true),
      manageAppearance: Boolean(
        await this.options.access.canManageAppearance({ req: this.req }),
      ),
      observedAt: new Date().toISOString(),
    });
  }
}
