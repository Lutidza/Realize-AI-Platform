/**
 * @file packages/change-engine/src/dataOperationPolicy.ts
 * @version 2026-08-28
 * @description Вычисляет immutable hashes и approval bindings Payload Data Lane.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import { createHash } from "node:crypto";

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** Security-relevant fields of one resolved category assignment dry-run. */
export type CategoryAssignmentHashInput = {
  afterCategoryIDs: string[];
  beforeCategoryIDs: string[];
  categoryID: string;
  expectedTargetUpdatedAt: string;
  productID: string;
};

/** Binds the typed operation to exact targets, state and rollback strategy. */
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

/** Binds compensating execution to the exact before/after dry-run snapshot. */
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

/** Hashes every field that makes a data or rollback decision valid. */
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
