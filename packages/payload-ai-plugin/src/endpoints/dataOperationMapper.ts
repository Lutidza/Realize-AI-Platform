/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationMapper.ts
 * @version 1.1.0
 * @date 2026-09-12
 * @description Проецирует DataOperation persistence в allowlisted browser DTO.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import {
  parseCreatePageDraftIntent,
  parseUpdatePageDraftIntent,
} from "@realize/ai-contracts";
import type { AppliedPageDraftSnapshot } from "./PageDraft.types";
import type { PageDraftUpdateSnapshot } from "./PageDraftUpdate.types";
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

/** Преобразует неизменяемое решение без выдачи raw actor relationship. */
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

/** Преобразует операцию и отдельные решения в типизированный browser DTO. */
export const toDataOperationDTO = (input: {
  approval?: AIDocument;
  operation: AIDocument;
  rollbackApproval?: AIDocument;
}): DataOperationDTO => {
  const beforeCategories = documentRefs(input.operation.beforeSnapshot);
  const afterCategories = documentRefs(input.operation.afterSnapshot);
  const beforeIDs = new Set(beforeCategories.map((category) => category.id));

  const base = {
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
    estimatedCount: 1 as const,
    expiresAt: iso(input.operation.expiresAt),
    id: String(input.operation.id),
    operationHash:
      typeof input.operation.operationHash === "string"
        ? input.operation.operationHash
        : "",
    riskLevel: "R1" as const,
    rollbackApproval: input.rollbackApproval
      ? toDataOperationApprovalDTO(input.rollbackApproval)
      : undefined,
    rollbackHash:
      typeof input.operation.rollbackHash === "string"
        ? input.operation.rollbackHash
        : "",
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
  if (input.operation.kind === "pages.updateDraft.v1") {
    const intent = parseUpdatePageDraftIntent(input.operation.intent);
    const snapshot = input.operation.afterSnapshot as PageDraftUpdateSnapshot;
    const applied = input.operation.appliedSnapshot as
      AppliedPageDraftSnapshot | undefined;
    return {
      ...base,
      kind: "pages.updateDraft.v1",
      rollbackStrategy: "before-snapshot",
      expectedTargetUpdatedAt: intent.expectedUpdatedAt,
      preview: {
        page: documentRef(snapshot.preview.page),
        changes: intent.changes.map((change) => ({
          path: change.path,
          before: change.before,
          after: change.after,
          label:
            snapshot.preview.changes.find((item) => item.path === change.path)
              ?.label ?? change.path,
        })),
        status: "draft",
      },
      ...(applied?.pageID &&
      ["applied", "rollback_approved", "rollback_failed"].includes(
        String(input.operation.state),
      )
        ? {
            result: {
              page: {
                id: applied.pageID,
                title: applied.title,
                slug: applied.slug,
              },
              adminUrl: applied.adminUrl,
            },
          }
        : {}),
    };
  }
  if (input.operation.kind === "pages.createDraft.v1") {
    const intent = parseCreatePageDraftIntent(input.operation.intent);
    const applied = input.operation.appliedSnapshot as
      AppliedPageDraftSnapshot | undefined;
    return {
      ...base,
      kind: "pages.createDraft.v1",
      rollbackStrategy: "delete-created-draft",
      preview: {
        title: intent.title,
        slug: intent.slug,
        sections: intent.sections,
        ...(intent.description ? { description: intent.description } : {}),
        status: "draft",
      },
      ...(applied?.pageID &&
      ["applied", "rollback_approved", "rollback_failed"].includes(
        String(input.operation.state),
      )
        ? {
            result: {
              page: {
                id: applied.pageID,
                title: applied.title,
                slug: applied.slug,
              },
              adminUrl: applied.adminUrl,
            },
          }
        : {}),
    };
  }
  return {
    ...base,
    kind: "catalog.assignCategory.v1",
    rollbackStrategy: "before-snapshot",
    expectedTargetUpdatedAt:
      typeof input.operation.expectedTargetUpdatedAt === "string"
        ? input.operation.expectedTargetUpdatedAt
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
  };
};
