/**
 * @file src/plugins/extensionManager.config.ts
 * @version 1.3.0
 * @date 2026-11-12
 * @description Компонует trusted каталог и права Realize для независимого менеджера расширений.
 * @see documentation/specifications/extension-management.md
 */
import { createHash } from "node:crypto";
import type { ExtensionManagerOptions } from "@realize/payload-extension-manager";
import { checkRole } from "@/access/utilities";
import { isPlatformOwner } from "@/access/platformOwner.policy";
import { adminAppearanceConfig } from "@/components/admin/system-shell/adminAppearance.config";
import { readAdminShellPolicy } from "@/components/admin/system-shell/readAdminShellPolicy.service";
import { readTemplateRuntimeInstallation } from "@/components/admin/system-shell/readTemplateRuntimeInstallation.service";
import { extensionTemplateCatalog } from "./extensionTemplateCatalog.config";

const identity = `${process.env.REALIZE_INSTALLATION_ID ?? "local"}:${process.env.REALIZE_PROJECT_ID ?? "realize"}`;

/** Права смены данных и установки кода раздельны; новый delivery adapter пока не подключён. */
export const extensionManagerOptions: ExtensionManagerOptions = {
  adminShell: readAdminShellPolicy,
  userCollection: "users",
  scopeKey: `realize:extensions:${createHash("sha256").update(identity).digest("hex")}`,
  hostCompatibility: adminAppearanceConfig.host,
  defaultAdmin: {
    selection: adminAppearanceConfig.selection,
    settings: adminAppearanceConfig.settings,
  },
  catalog: extensionTemplateCatalog,
  runtimeBuildId: async () =>
    (await readTemplateRuntimeInstallation())?.buildId ?? null,
  runtimeInstallation: readTemplateRuntimeInstallation,
  access: {
    canReadCatalog: ({ req }) =>
      Boolean(req.user && checkRole(["admin"], req.user)),
    canManageAppearance: ({ req }) =>
      Boolean(req.user && checkRole(["admin"], req.user)),
    canInstallCode: ({ req }) => isPlatformOwner(req),
  },
};
