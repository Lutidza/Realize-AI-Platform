/**
 * @file packages/payload-extension-manager/src/admin-shell/AdminShell.types.ts
 * @version 1.2.0
 * @date 2026-11-18
 * @description Разделяет native/custom выбор host и неизменяемые template assignments.
 * @see documentation/specifications/extension-management.md
 */
import type {
  ExtensionAssignment,
  ExtensionAppearanceStore,
  ExtensionLayoutAssignmentWritePolicy,
} from "../appearance/ExtensionAppearance.types";
import type {
  ExtensionCatalog,
  ExtensionTemplateReadiness,
} from "../catalog/ExtensionCatalog.types";

export type AdminShellMode = "native" | "template";
/** Native version — metadata установленной CMS, не версия собственного template package. */
export type AdminShellPolicy = {
  enabled: { native: boolean; template: boolean };
  defaultMode: AdminShellMode;
  fallbackMode: AdminShellMode;
  nativeVersion: string;
  nativeRoute: string;
  templateRoute: string;
};
export type AdminShellState = {
  revision: number;
  current: AdminShellMode;
  previous: AdminShellMode | null;
};
/** Guard относится к readonly Admin assignment; frontend revision в него не входит. */
export type AdminShellTemplateBinding = {
  appearanceRevision: number;
  appearanceHash: string;
  catalogHash: string;
  assignment: ExtensionAssignment;
};
export type PrepareAdminShellInput =
  | {
      action: "select";
      mode: AdminShellMode;
      expectedRevision: number;
      expectedPolicyHash: string;
    }
  | { action: "recover"; expectedRevision: number; expectedPolicyHash: string };
export type ApplyAdminShellInput = { planId: string; expectedPlanHash: string };
/** Actor/request metadata остаётся private; hash покрывает полный immutable plan. */
export type AdminShellPlan = {
  id: string;
  hash: string;
  actorKey: string;
  requestId: string;
  inputFingerprint: string;
  action: "select" | "recover";
  currentMode: AdminShellMode;
  desiredMode: AdminShellMode;
  expectedRevision: number;
  stateHash: string;
  policyHash: string;
  templateBinding: AdminShellTemplateBinding | null;
  createdAt: string;
  expiresAt: string;
};
export type AdminShellPlanDto = {
  /** Текущая политика exact template binding; не сохраняется в immutable shell plan. */
  readiness?: ExtensionTemplateReadiness;
  planId: string;
  planHash: string;
  action: "select" | "recover";
  currentMode: AdminShellMode;
  desiredMode: AdminShellMode;
  expectedRevision: number;
  policyHash: string;
  templateBinding: AdminShellTemplateBinding | null;
  createdAt: string;
  expiresAt: string;
};
export type AdminShellReceiptDto = {
  planId: string;
  appliedRevision: number;
  mode: AdminShellMode;
  appliedAt: string;
};
export type AdminShellPrepareReceipt = {
  kind: "prepare";
  actorKey: string;
  requestId: string;
  inputFingerprint: string;
  plan: AdminShellPlan;
};
export type AdminShellApplyReceipt = AdminShellReceiptDto & {
  kind: "apply";
  actorKey: string;
  requestId: string;
  inputFingerprint: string;
};
export type AdminShellReceipt =
  AdminShellPrepareReceipt | AdminShellApplyReceipt;
/** Ledger persistence хранит receipts отдельно; в JSON state запись содержит receipts: []. */
export type AdminShellStore = {
  schemaVersion: "1.0";
  domain: "admin-shell";
  state: AdminShellState;
  plans: AdminShellPlan[];
  receipts: AdminShellReceipt[];
};
export type AdminShellSnapshotDto = {
  policy: AdminShellPolicy;
  policyHash: string;
  state: AdminShellState;
  storage: "ready" | "requires_schema";
  history: AdminShellReceiptDto[];
  permissions: { manageShell: boolean };
};
export type AdminShellPrepareResponseDto = {
  plan: AdminShellPlanDto;
  replayed: boolean;
};
export type AdminShellApplyResponseDto = {
  receipt: AdminShellReceiptDto;
  replayed: boolean;
};
export type PrepareAdminShellResult = AdminShellPrepareResponseDto & {
  store: AdminShellStore;
};
export type ApplyAdminShellResult = AdminShellApplyResponseDto & {
  store: AdminShellStore;
};
export type AdminShellAppearance = {
  store: ExtensionAppearanceStore;
  catalog: ExtensionCatalog;
};
export type AdminShellOperationContext = {
  layoutAssignmentWrites?: ExtensionLayoutAssignmentWritePolicy;
  store: AdminShellStore;
  policy: AdminShellPolicy;
  appearance: AdminShellAppearance | null;
  actorKey: string;
  nowMs: number;
};
export type PrepareAdminShellOperation = AdminShellOperationContext & {
  requestId: string;
  input: unknown;
  planId: string;
  ttlMs?: number;
};
export type PreviewAdminShellOperation = AdminShellOperationContext & {
  planId: string;
};
export type ApplyAdminShellOperation = AdminShellOperationContext & {
  requestId: string;
  input: unknown;
};
export type AssertAdminShellPlanInput = AdminShellOperationContext & {
  plan: AdminShellPlan;
};
export type ReadAdminShellStateInput = {
  store: AdminShellStore;
  policy: AdminShellPolicy;
  appearance: AdminShellAppearance | null;
};
/** Effective fallback не переписывает current/previous и не является сохранением нового выбора. */
export type ReadAdminShellStateResult = {
  state: AdminShellState;
  effectiveMode: AdminShellMode | null;
  requiresRecovery: boolean;
  fallbackReason: "policy_disabled" | "template_unavailable" | null;
};
