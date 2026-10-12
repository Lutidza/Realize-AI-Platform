/**
 * @file packages/payload-extension-manager/src/ExtensionManagerOptions.types.ts
 * @version 1.2.0
 * @date 2026-10-12
 * @description Задаёт host policy и доверенный compiled registry независимого Payload manager.
 * @see documentation/specifications/extension-management.md
 */
import type { PayloadRequest } from "payload";
import type {
  TemplateHostCompatibility,
  TemplateSelection,
  TemplateSettings,
} from "@realize/template-contracts";
import type { ExtensionCatalogRegistration } from "./catalog/ExtensionCatalog.types";
import type { AdminShellPolicy } from "./admin-shell/AdminShell.types";
import type { InstalledTemplateRuntimeReceipt } from "./installed-templates/InstalledTemplates.types";

export type ExtensionAccessCallback = (input: {
  req: PayloadRequest;
}) => boolean | Promise<boolean>;
export type ExtensionManagerOptions = {
  userCollection: string;
  scopeKey: string;
  apiRoute?: string;
  catalog: readonly ExtensionCatalogRegistration[];
  hostCompatibility: TemplateHostCompatibility;
  defaultAdmin?: { selection: TemplateSelection; settings: TemplateSettings };
  defaultFrontend?: {
    selection: TemplateSelection;
    settings: TemplateSettings;
  };
  runtimeBuildId?: () => Promise<string | null>;
  /** Только host доказывает receipt/BUILD_ID работающего процесса; отсутствие остаётся unverified. */
  runtimeInstallation?: () => Promise<InstalledTemplateRuntimeReceipt | null>;
  /** Host читает installed CMS metadata; browser input не меняет policy. */
  adminShell?: AdminShellPolicy | (() => Promise<AdminShellPolicy>);
  access: {
    canReadCatalog: ExtensionAccessCallback;
    canManageAppearance: ExtensionAccessCallback;
    canInstallCode: ExtensionAccessCallback;
  };
};
export type ResolvedExtensionManagerOptions = ExtensionManagerOptions & {
  apiRoute: string;
};
