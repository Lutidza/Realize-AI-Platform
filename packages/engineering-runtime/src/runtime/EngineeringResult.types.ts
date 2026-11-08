/**
 * @file packages/engineering-runtime/src/runtime/EngineeringResult.types.ts
 * @version 1.3.0
 * @date 2026-10-28
 * @description Определяет публичные проекции планов, состояний и восстановления.
 * @see documentation/architecture/engineering-operations.md
 */
import type {
  BindingState,
  CancelState,
  ChecksSummary,
  EffectsSummary,
  EngineeringErrorDto,
  OperationState,
  WriteBlock,
} from "../contracts/EngineeringState.types.ts";

/** Версия политики принадлежит доверенному project binding. */
export interface VersionRef {
  id: string;
  version: string;
}
export interface PlannedEffect {
  kind: string;
  paths: string[];
  description: string;
  diff: string | null;
  contentSha256?: string | null;
  /** Полный состав одного directory rename; paths содержит все пары для ACL. */
  movedArtifacts?: PlannedMoveArtifact[];
}
export interface PlannedMoveArtifact {
  from: string;
  to: string;
  kind: "file" | "directory";
  sha256: string | null;
}
export interface OperationPlan {
  schemaVersion: 1;
  operationId: string;
  planId: string;
  planHash: string;
  createdAt: string;
  expiresAt: string;
  targetRef: { id: string; version: string };
  sourceManifestHash: string;
  policyRefs: VersionRef[];
  recipeRefs: VersionRef[];
  effects: PlannedEffect[];
  checkSelection: string[];
  taskRefs: string[];
  coverage: { complete: boolean; limitations: string[] };
  budgets: { maxEffects: number; maxStoredBytes: number };
}
export interface OperationView {
  schemaVersion: 1;
  operationId: string;
  revision: number;
  state: OperationState;
  attempt: number;
  planRef: { planId: string; planHash: string } | null;
  effectsSummary: EffectsSummary;
  checksSummary: ChecksSummary;
  bindingState: BindingState;
  receiptRef: string | null;
  cancelState: CancelState;
  writeBlock: WriteBlock;
  error: EngineeringErrorDto | null;
  nextAction: string | null;
}
export interface OperationReceipt {
  schemaVersion: 1;
  id: string;
  previousReceiptRef: string | null;
  operationId: string;
  revision: number;
  origin: "typed";
  planHash: string;
  requestHash: string;
  actor: { kind: string; id: string };
  targetRef: { id: string; version: string };
  effectsSummary: EffectsSummary;
  beforeManifestHash: string;
  afterManifestHash: string;
  checksSummary: ChecksSummary;
  checkReceiptRefs: string[];
  taskRefs: string[];
  gitRefs: string[];
  createdAt: string;
  limitations: string[];
  createdArtifacts?: {
    path: string;
    kind: "file" | "directory";
    sha256: string | null;
  }[];
  /** Итоговые create/edit и все destination move: каталоги с null hash, файлы с последним hash. */
  changedArtifacts?: {
    path: string;
    kind: "file" | "directory";
    sha256: string | null;
  }[];
}
export interface RecoveryView {
  schemaVersion: 1;
  operationId: string;
  revision: number;
  recoveryPlanId: string;
  recoveryPlanHash: string;
  observedManifestHash: string;
  cursor: number;
  pending: number | null;
  writerStopped: boolean;
  actions: ("resume" | "compensate" | "retain_partial")[];
}
export interface PreviewPage {
  plan: Omit<OperationPlan, "effects">;
  effects: PlannedEffect[];
  hasMore: boolean;
  nextCursor: string | null;
}
export interface OperationEvent {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  epoch: string;
  seq: number;
  operationId: string;
  attempt: number | null;
  origin: "typed";
  kind: string;
  observedAt: string;
  changedPathRefs: string[];
  manifestRef: string | null;
  causationId: string | null;
  coverage: { complete: boolean };
}
export interface EventPage {
  events: OperationEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  coverage: { complete: boolean };
}
