/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationMapper.ts
 * @version 2026-08-28
 * @description Проецирует DataOperation persistence в allowlisted browser DTO.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type {
  DataDocumentRefDTO,
  DataOperationApprovalDTO,
  DataOperationDTO,
  DataOperationState,
} from "@realize/ai-contracts";

import { relationID } from "./mappers";
import type { AIDocument } from "./repository";

const iso = (value: unknown): string =>
  typeof value === "string" ? value : new Date(0).toISOString();

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const documentRef = (value: unknown): DataDocumentRefDTO => {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    id: typeof source.id === "string" ? source.id : "",
    ...(typeof source.slug === "string" ? { slug: source.slug } : {}),
    title: typeof source.title === "string" ? source.title : "Документ",
  };
};

const documentRefs = (value: unknown): DataDocumentRefDTO[] =>
  Array.isArray(value) ? value.map(documentRef).filter((item) => item.id) : [];

/** Maps an append-only decision without exposing its raw actor relationship. */
export const toDataOperationApprovalDTO = (
  document: AIDocument,
): DataOperationApprovalDTO => ({
  actorRole: stringArray(document.roleSnapshot)[0] || "authorized-user",
  boundHash: typeof document.boundHash === "string" ? document.boundHash : "",
  comment: typeof document.comment === "string" ? document.comment : undefined,
  createdAt: iso(document.createdAt),
  decision: document.decision === "rejected" ? "rejected" : "approved",
  expiresAt: iso(document.expiresAt),
  id: String(document.id),
  targetHash:
    typeof document.targetHash === "string" ? document.targetHash : "",
  type:
    document.type === "ROLLBACK_APPROVAL"
      ? "ROLLBACK_APPROVAL"
      : "WRITE_CONFIRMATION",
});

/** Maps one durable data operation and its independent decisions. */
export const toDataOperationDTO = (input: {
  approval?: AIDocument;
  operation: AIDocument;
  rollbackApproval?: AIDocument;
}): DataOperationDTO => {
  const beforeCategories = documentRefs(input.operation.beforeSnapshot);
  const afterCategories = documentRefs(input.operation.afterSnapshot);
  const beforeIDs = new Set(beforeCategories.map((category) => category.id));

  return {
    approval: input.approval
      ? toDataOperationApprovalDTO(input.approval)
      : undefined,
    appliedAt:
      typeof input.operation.appliedAt === "string"
        ? input.operation.appliedAt
        : undefined,
    conversationID: relationID(input.operation.conversation),
    createdAt: iso(input.operation.createdAt),
    errorSummary:
      typeof input.operation.errorSummary === "string"
        ? input.operation.errorSummary
        : undefined,
    estimatedCount: 1,
    expectedTargetUpdatedAt:
      typeof input.operation.expectedTargetUpdatedAt === "string"
        ? input.operation.expectedTargetUpdatedAt
        : "",
    expiresAt: iso(input.operation.expiresAt),
    id: String(input.operation.id),
    kind: "catalog.assignCategory.v1",
    operationHash:
      typeof input.operation.operationHash === "string"
        ? input.operation.operationHash
        : "",
    preview: {
      addedCategories: afterCategories.filter(
        (category) => !beforeIDs.has(category.id),
      ),
      afterCategories,
      beforeCategories,
      category: documentRef(input.operation.categorySnapshot),
      product: documentRef(input.operation.productSnapshot),
    },
    riskLevel: "R1",
    rollbackApproval: input.rollbackApproval
      ? toDataOperationApprovalDTO(input.rollbackApproval)
      : undefined,
    rollbackHash:
      typeof input.operation.rollbackHash === "string"
        ? input.operation.rollbackHash
        : "",
    rollbackStrategy: "before-snapshot",
    rolledBackAt:
      typeof input.operation.rolledBackAt === "string"
        ? input.operation.rolledBackAt
        : undefined,
    sourceMessageID: relationID(input.operation.sourceMessage),
    state: input.operation.state as DataOperationState,
    title:
      typeof input.operation.title === "string"
        ? input.operation.title
        : "Data Operation",
    updatedAt: iso(input.operation.updatedAt),
    version: Number(input.operation.version || 1),
  };
};
