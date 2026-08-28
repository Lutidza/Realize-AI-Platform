/**
 * @file packages/ai-contracts/src/dataOperations.ts
 * @version 2026-08-28
 * @description Задаёт typed browser и assistant contracts первого Payload Data Lane.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

/** Единственная allowlisted операция первого Data Lane. */
export type DataOperationKind = "catalog.assignCategory.v1";

/** Explicit selector supplied by the assistant; exactly one key is accepted. */
export type DataEntitySelector =
  { id: string } | { slug: string } | { title: string };

/** Declarative assistant intent; it never grants write authority by itself. */
export type AssignProductCategoryIntent = {
  category: DataEntitySelector;
  kind: DataOperationKind;
  product: DataEntitySelector;
  version: "1.0";
};

/** Bounded document identity safe to render in Payload Admin. */
export type DataDocumentRefDTO = {
  id: string;
  slug?: string;
  title: string;
};

/** Before/after projection produced without a production write. */
export type CategoryAssignmentPreviewDTO = {
  addedCategories: DataDocumentRefDTO[];
  afterCategories: DataDocumentRefDTO[];
  beforeCategories: DataDocumentRefDTO[];
  category: DataDocumentRefDTO;
  product: DataDocumentRefDTO;
};

/** Durable lifecycle of one category-assignment aggregate. */
export type DataOperationState =
  | "apply_failed"
  | "applied"
  | "approved"
  | "awaiting_approval"
  | "rejected"
  | "rollback_approved"
  | "rollback_failed"
  | "rolled_back";

/** Hash-bound human decision without raw Payload user data. */
export type DataOperationApprovalDTO = {
  actorRole: string;
  boundHash: string;
  comment?: string;
  createdAt: string;
  decision: "approved" | "rejected";
  expiresAt: string;
  id: string;
  targetHash: string;
  type: "ROLLBACK_APPROVAL" | "WRITE_CONFIRMATION";
};

/** Browser-safe aggregate for dry-run, apply and compensating rollback. */
export type DataOperationDTO = {
  approval?: DataOperationApprovalDTO;
  appliedAt?: string;
  conversationID: string;
  createdAt: string;
  errorSummary?: string;
  estimatedCount: 1;
  expectedTargetUpdatedAt: string;
  expiresAt: string;
  id: string;
  kind: DataOperationKind;
  operationHash: string;
  preview: CategoryAssignmentPreviewDTO;
  riskLevel: "R1";
  rollbackApproval?: DataOperationApprovalDTO;
  rollbackHash: string;
  rollbackStrategy: "before-snapshot";
  rolledBackAt?: string;
  sourceMessageID: string;
  state: DataOperationState;
  title: string;
  updatedAt: string;
  version: number;
};

/** Selects one persisted assistant response as the operation source. */
export type CreateDataOperationInput = {
  sourceMessageID: string;
};

/** Approves or rejects one exact dry-run version. */
export type DecideDataOperationInput = {
  comment?: string;
  expectedOperationHash: string;
  expectedVersion: number;
};

/** Applies one exact approved operation. */
export type ApplyDataOperationInput = {
  expectedOperationHash: string;
  expectedVersion: number;
};

/** Approves or executes a compensating rollback bound to its snapshot. */
export type DataRollbackInput = {
  comment?: string;
  expectedRollbackHash: string;
  expectedVersion: number;
};
