/**
 * @file packages/payload-extension-manager/src/appearance/ExtensionAppearance.types.ts
 * @version 1.4.0
 * @date 2026-11-18
 * @description Определяет независимые назначения, планы и durable replay ledger appearance.
 * @see documentation/specifications/extension-management.md
 */
import type {
  LayoutAssignmentBinding,
  TemplateSelection,
  TemplateSettings,
  TemplateTarget,
} from "@realize/template-contracts";
import type {
  ExtensionCatalog,
  ExtensionTemplateReadiness,
} from "../catalog/ExtensionCatalog.types";

/** Settings — нормализованный снимок; manifestHash относится к точной compiled версии. */
export type ExtensionAssignment = {
  selection: TemplateSelection;
  settings: TemplateSettings;
  manifestHash: string;
  /** Server-derived exact snapshot; durable запись отдельно закрыта write policy. */
  layout?: LayoutAssignmentBinding;
};
/** Полномочие server operation, не поле command/DTO; отсутствие разрешения закрывает новую запись. */
export type ExtensionLayoutAssignmentWritePolicy = "disabled" | "enabled";
export type ExtensionTargetState = {
  revision: number;
  current: ExtensionAssignment | null;
  previous: ExtensionAssignment | null;
};
export type PrepareExtensionAppearanceInput =
  | {
      action: "assign";
      target: TemplateTarget;
      expectedRevision: number;
      expectedCatalogHash: string;
      selection: TemplateSelection;
      settings: TemplateSettings;
    }
  | {
      action: "recover";
      target: TemplateTarget;
      expectedRevision: number;
      expectedCatalogHash: string;
    };
export type ApplyExtensionAppearanceInput = {
  planId: string;
  expectedPlanHash: string;
};

/** Actor/request metadata — только storage/server; hash покрывает все immutable поля. */
export type ExtensionAppearancePlan = {
  id: string;
  hash: string;
  actorKey: string;
  requestId: string;
  inputFingerprint: string;
  action: "assign" | "recover";
  target: TemplateTarget;
  expectedRevision: number;
  stateHash: string;
  catalogHash: string;
  desiredAssignment: ExtensionAssignment;
  createdAt: string;
  expiresAt: string;
};
/** DTO не содержит actorKey/requestId/input fingerprint. */
export type ExtensionAppearancePlanDto = {
  /** Read-only текущая политика каталога; не входит в сохраняемый план или его hash. */
  readiness?: ExtensionTemplateReadiness;
  planId: string;
  planHash: string;
  action: "assign" | "recover";
  target: TemplateTarget;
  expectedRevision: number;
  catalogHash: string;
  current: ExtensionAssignment | null;
  desiredAssignment: ExtensionAssignment;
  createdAt: string;
  expiresAt: string;
};
export type ExtensionAppearanceReceiptDto = {
  planId: string;
  target: TemplateTarget;
  appliedRevision: number;
  assignment: ExtensionAssignment;
  appliedAt: string;
};
/** Prepare receipt удерживает прежний ключ после удаления expired/applied pending plan. */
export type ExtensionPrepareReceipt = {
  kind: "prepare";
  actorKey: string;
  requestId: string;
  inputFingerprint: string;
  plan: ExtensionAppearancePlan;
  current: ExtensionAssignment | null;
};
export type ExtensionApplyReceipt = ExtensionAppearanceReceiptDto & {
  kind: "apply";
  actorKey: string;
  requestId: string;
  inputFingerprint: string;
};
export type ExtensionAppearanceReceipt =
  ExtensionPrepareReceipt | ExtensionApplyReceipt;
/** Один сериализуемый store; persistence выполняет CAS/ledger mutation в своей транзакции. */
export type ExtensionAppearanceStore = {
  schemaVersion: "1.0";
  targets: { admin: ExtensionTargetState; frontend: ExtensionTargetState };
  plans: ExtensionAppearancePlan[];
  receipts: ExtensionAppearanceReceipt[];
};
export type PrepareExtensionAppearanceResult = {
  store: ExtensionAppearanceStore;
  plan: ExtensionAppearancePlanDto;
  replayed: boolean;
};
export type ApplyExtensionAppearanceResult = {
  store: ExtensionAppearanceStore;
  receipt: ExtensionAppearanceReceiptDto;
  replayed: boolean;
};

export type CreateExtensionAppearanceStoreInput = {
  admin?: ExtensionAssignment | null;
  frontend?: ExtensionAssignment | null;
};
/** Server authority и clock передаются host; command body не вправе их задавать. */
export type ExtensionOperationContext = {
  actorKey: string;
  nowMs: number;
  requestId?: string;
  planId?: string;
};
export type PrepareExtensionAppearanceOperation = {
  layoutAssignmentWrites?: ExtensionLayoutAssignmentWritePolicy;
  store: ExtensionAppearanceStore;
  catalog: ExtensionCatalog;
  actorKey: string;
  requestId: string;
  planId: string;
  input: unknown;
  nowMs: number;
  ttlMs?: number;
};
export type PreviewExtensionAppearanceOperation = {
  store: ExtensionAppearanceStore;
  catalog: ExtensionCatalog;
  actorKey: string;
  planId: string;
  nowMs: number;
};
export type ApplyExtensionAppearanceOperation = {
  layoutAssignmentWrites?: ExtensionLayoutAssignmentWritePolicy;
  store: ExtensionAppearanceStore;
  catalog: ExtensionCatalog;
  actorKey: string;
  requestId: string;
  input: unknown;
  nowMs: number;
};
export type AssertExtensionPlanCurrentInput = {
  store: ExtensionAppearanceStore;
  catalog: ExtensionCatalog;
  actorKey: string;
  plan: ExtensionAppearancePlan;
  nowMs: number;
};
export type ExtensionManagerErrorCode =
  | "INVALID_POLICY"
  | "POLICY_CHANGED"
  | "SHELL_UNAVAILABLE"
  | "INVALID_INPUT"
  | "INVALID_STORE"
  | "INVALID_CATALOG"
  | "INVALID_SETTINGS"
  | "CATALOG_CHANGED"
  | "REVISION_CONFLICT"
  | "STATE_CHANGED"
  | "PLAN_NOT_FOUND"
  | "PLAN_EXPIRED"
  | "PLAN_HASH_MISMATCH"
  | "PLAN_ACTOR_MISMATCH"
  | "NO_PREVIOUS_ASSIGNMENT"
  | "REPLAY_CONFLICT"
  | "LIMIT_REACHED"
  | "TEMPLATE_PREVIEW_ONLY"
  | "LAYOUT_BINDING_WRITES_DISABLED"
  | "ASSIGNMENT_UNAVAILABLE";
