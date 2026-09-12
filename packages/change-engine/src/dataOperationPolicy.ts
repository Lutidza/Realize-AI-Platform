/**
 * @file packages/change-engine/src/dataOperationPolicy.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Вычисляет immutable hashes и approval bindings Payload Data Lane.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import { createHash } from "node:crypto";
import { hashCanonicalJSON } from "./canonicalJson";
import type {
  PageDraftOperationHashInput,
  PageDraftRollbackHashInput,
} from "./PageDraftPolicy.types";

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** Поля, определяющие безопасность подготовленного назначения категории. */
export type CategoryAssignmentHashInput = {
  afterCategoryIDs: string[];
  beforeCategoryIDs: string[];
  categoryID: string;
  expectedTargetUpdatedAt: string;
  productID: string;
};

/** Связывает операцию с точными целями, состоянием и стратегией отката. */
export const createCategoryAssignmentOperationHash = (
  input: CategoryAssignmentHashInput,
): string =>
  sha256(
    JSON.stringify({
      affectedDocuments: [
        {
          collection: "products",
          id: input.productID,
          version: input.expectedTargetUpdatedAt,
        },
        { collection: "categories", id: input.categoryID },
      ],
      afterCategoryIDs: input.afterCategoryIDs,
      beforeCategoryIDs: input.beforeCategoryIDs,
      kind: "catalog.assignCategory.v1",
      rollbackStrategy: "before-snapshot",
      version: "1.0",
    }),
  );

/** Связывает компенсирующую запись с точным snapshot до и после изменения. */
export const createCategoryAssignmentRollbackHash = (input: {
  afterCategoryIDs: string[];
  beforeCategoryIDs: string[];
  operationHash: string;
  productID: string;
}): string =>
  sha256(
    JSON.stringify({
      afterCategoryIDs: input.afterCategoryIDs,
      beforeCategoryIDs: input.beforeCategoryIDs,
      kind: "catalog.assignCategory.rollback.v1",
      operationHash: input.operationHash,
      productID: input.productID,
    }),
  );

/** Включает в hash все поля, определяющие действительность решения. */
export const createDataOperationApprovalBinding = (input: {
  actorID: string;
  actorRoles: string[];
  approvalType: "ROLLBACK_APPROVAL" | "WRITE_CONFIRMATION";
  dataOperationID: string;
  decision: "approved" | "rejected";
  expiresAt: string;
  targetHash: string;
  version: number;
}): string =>
  sha256(
    JSON.stringify([
      input.dataOperationID,
      input.version,
      input.approvalType,
      input.targetHash,
      input.decision,
      input.actorID,
      [...input.actorRoles].sort(),
      input.expiresAt,
    ]),
  );

/** Связывает подтверждение с точным текстом, свободным slug и серверным рецептом записи. */
export const createPageDraftOperationHash = (
  input: PageDraftOperationHashInput,
): string =>
  hashCanonicalJSON({
    collection: "pages",
    createDataHash: input.createDataHash,
    expectedSlugState: "absent",
    intent: input.intent,
    mapperVersion: input.mapperVersion,
    rollbackStrategy: "delete-created-draft",
    status: "draft",
  });

/** До apply hash описывает рецепт, после apply связывает откат с неизменённым созданным draft. */
export const createPageDraftRollbackHash = (
  input: PageDraftRollbackHashInput,
): string => {
  const hasCreatedPage = input.pageID !== undefined;
  if (
    hasCreatedPage !== (input.updatedAt !== undefined) ||
    hasCreatedPage !== (input.fingerprint !== undefined) ||
    (hasCreatedPage &&
      (!input.pageID || !input.updatedAt || !input.fingerprint))
  ) {
    throw new Error(
      "Page draft rollback requires pageID, updatedAt and fingerprint together.",
    );
  }
  return hashCanonicalJSON({
    kind: "pages.createDraft.rollback.v1",
    operationHash: input.operationHash,
    rollbackStrategy: "delete-created-draft",
    ...(hasCreatedPage
      ? {
          fingerprint: input.fingerprint,
          pageID: input.pageID,
          updatedAt: input.updatedAt,
        }
      : { state: "not-created" }),
  });
};
