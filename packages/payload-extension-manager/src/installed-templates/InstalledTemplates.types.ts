/**
 * @file packages/payload-extension-manager/src/installed-templates/InstalledTemplates.types.ts
 * @version 1.1.0
 * @date 2026-11-12
 * @description Определяет read-only inventory runtime и отдельные состояния выбора, активности и defaults.
 * @see documentation/specifications/extension-management.md
 */
import type { TemplateMode, TemplateTarget } from "@realize/template-contracts";
import type {
  AdminShellMode,
  AdminShellPolicy,
} from "../admin-shell/AdminShell.types";
import type {
  ExtensionAssignment,
  ExtensionAppearanceStore,
} from "../appearance/ExtensionAppearance.types";
import type {
  ExtensionTemplateReadiness,
  ExtensionCatalog,
} from "../catalog/ExtensionCatalog.types";

/** Host проверяет receipt против BUILD_ID именно работающего процесса до передачи mapper. */
export type InstalledTemplateRuntimeReceipt = {
  schemaVersion: "1.0";
  buildId: string;
  sourceVersion: string;
  builtAt: string;
};
export type InstalledTemplateRuntimeEvidence =
  InstalledTemplateRuntimeReceipt & {
    catalogHash: string;
  };
export type InstalledTemplateRuntimeDto = {
  status: "verified" | "unverified";
  buildId: string | null;
  sourceVersion: string | null;
  builtAt: string | null;
};
export type InstalledTemplatePaletteDto = {
  id: string;
  version: string;
  label: string;
  modes: TemplateMode[];
};
export type InstalledTemplateActionReason =
  | "read_only"
  | "requires_schema"
  | "runtime_unverified"
  | "unavailable"
  | "preview_only";
export type InstalledTemplateActionsDto = {
  settings: boolean;
  select: boolean;
  reason: InstalledTemplateActionReason | null;
};
export type InstalledTemplateUsageDto = {
  selectedTargets: TemplateTarget[];
  activeTargets: TemplateTarget[];
  defaultTargets: TemplateTarget[];
};
type InstalledTemplateEntryFields = {
  key: string;
  id: string;
  name: string;
  version: string;
  targets: TemplateTarget[];
  installation: "confirmed" | "unverified";
  availability: "available" | "disabled" | "incompatible";
  usage: InstalledTemplateUsageDto;
  actions: InstalledTemplateActionsDto;
};
/** Builtin не притворяется SDK package: у него нет packageName, palette или custom settings. */
export type InstalledTemplateEntryDto =
  | (InstalledTemplateEntryFields & {
      kind: "builtin";
      id: "payload-native";
      packageName: null;
      palettes: [];
    })
  | (InstalledTemplateEntryFields & {
      kind: "package";
      readiness?: ExtensionTemplateReadiness;
      packageName: string;
      palettes: InstalledTemplatePaletteDto[];
    });
export type InstalledTemplateUnavailableAssignmentDto = {
  target: TemplateTarget;
  templateId: string;
  templateVersion: string;
  reason: "not_compiled" | "incompatible" | "invalid_assignment";
};
/** Публичный allowlist не содержит settings, hashes, actor/UUID ledger или raw Payload documents. */
export type InstalledTemplatesSnapshotDto = {
  schemaVersion: "1.0";
  runtime: InstalledTemplateRuntimeDto;
  entries: InstalledTemplateEntryDto[];
  unavailableAssignments: InstalledTemplateUnavailableAssignmentDto[];
  storage: "ready" | "requires_schema";
  permissions: { manageAppearance: boolean };
  observedAt: string;
};
/** Все данные читает host; pure mapper не делает I/O и не создаёт собственный installed registry. */
export type InstalledTemplatesLoaderContext = {
  catalog: ExtensionCatalog;
  store: ExtensionAppearanceStore;
  bootstrapStore: ExtensionAppearanceStore;
  policy: AdminShellPolicy | null;
  selectedShellMode: AdminShellMode | null;
  shellMode: AdminShellMode | null;
  assignmentByTarget: {
    admin: ExtensionAssignment | null;
    frontend: ExtensionAssignment | null;
  };
  requiresRecovery: readonly TemplateTarget[];
  runtime: unknown;
  storageReady: boolean;
  manageAppearance: boolean;
  observedAt: string;
};
