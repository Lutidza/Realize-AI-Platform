/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationMapper.ts
 * @version 1.5.1
 * @date 2026-10-12
 * @description Проецирует DataOperation persistence в allowlisted browser DTO.
 * @docref Realize — AI Platform v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import {
  parseCreatePageDraftIntent,
  parseUpdatePageDraftIntent,
  parseUpdatePageStructureDraftIntent,
  parsePageDraftStructurePreview,
  parsePagePublicationEvidence,
  type PagePublicationDeliveryDTO,
} from "@realize/ai-contracts";
import type { AppliedPageDraftSnapshot } from "./PageDraft.types";
import { DEFAULT_API_ROUTE } from "../constants";
import type { PageDraftUpdateSnapshot } from "./PageDraftUpdate.types";
import type {
  PageDraftStructureSnapshot,
  AppliedPageDraftStructureSnapshot,
} from "./PageDraftStructure.types";
import { EndpointError } from "./http";
import { isPagePublicationKind } from "./pagePublicationAccess.service";
import { toPagePublicationFields } from "./pagePublication.mapper";
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
  ...(document.previewEvidence
    ? {
        previewEvidence: parsePagePublicationEvidence(document.previewEvidence),
      }
    : {}),
});

/** Преобразует операцию и отдельные решения в типизированный browser DTO. */
export const toDataOperationDTO = (input: {
  approval?: AIDocument;
  operation: AIDocument;
  rollbackApproval?: AIDocument;
  delivery?: PagePublicationDeliveryDTO;
  adminRoute?: string;
  apiRoute?: string;
}): DataOperationDTO => {
  // Ссылка вычисляется из текущего API route, не записывается в снимок операции.
  const frontendPreviewUrl = `${(input.apiRoute ?? "/api").replace(/\/$/, "")}${DEFAULT_API_ROUTE}/data-operations/${encodeURIComponent(String(input.operation.id))}/open-page`;
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
  if (isPagePublicationKind(input.operation.kind))
    return {
      ...base,
      ...toPagePublicationFields(
        input.operation,
        input.delivery,
        input.adminRoute,
      ),
      frontendPreviewUrl,
    };
  if (input.operation.kind === "pages.updateStructureDraft.v1") {
    const intent = parseUpdatePageStructureDraftIntent(input.operation.intent);
    const snapshot = input.operation
      .afterSnapshot as PageDraftStructureSnapshot;
    const applied = input.operation.appliedSnapshot as
      AppliedPageDraftStructureSnapshot | undefined;
    const preview = parsePageDraftStructurePreview(snapshot.preview);
    if (
      preview.page.id !== intent.pageID ||
      preview.action !== intent.operation.type ||
      (intent.operation.type !== "insert" &&
        preview.blockID !== intent.operation.blockID) ||
      (intent.operation.type !== "remove" &&
        preview.beforeBlockID !== intent.operation.beforeBlockID)
    )
      throw new EndpointError(
        "CONFLICT",
        "Предпросмотр не соответствует предложенному изменению структуры.",
        409,
      );
    return {
      ...base,
      kind: "pages.updateStructureDraft.v1",
      rollbackStrategy: "before-snapshot",
      expectedTargetUpdatedAt: intent.expectedUpdatedAt,
      preview,
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
              frontendPreviewUrl,
            },
          }
        : {}),
    };
  }
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
              frontendPreviewUrl,
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
              frontendPreviewUrl,
            },
          }
        : {}),
    };
  }
  if (
    input.operation.kind !== undefined &&
    input.operation.kind !== "catalog.assignCategory.v1"
  )
    throw new EndpointError(
      "INVALID_REQUEST",
      "Тип операции данных не поддерживается.",
      400,
    );
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
