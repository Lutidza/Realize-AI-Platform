/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationRollback.ts
 * @version 1.1.0
 * @date 2026-09-12
 * @description Атомарно откатывает подтверждённую операцию данных с проверкой снимка.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type { Payload, PayloadRequest } from "payload";

import { PageDraftCreation } from "./pageDraftCreation.service";
import { PageDraftUpdate } from "./pageDraftUpdate.service";
import { CatalogCategoryAssignment } from "./catalogCategoryAssignment";
import { DataOperationAuditRepository } from "./dataOperationAuditRepository";
import {
  assertDataOperationApproval,
  recordDataOperationFailure,
  snapshotIDs,
} from "./dataOperationExecutionSupport";
import { DataOperationRepository } from "./dataOperationRepository";
import { EndpointError } from "./http";
import { relationID } from "./mappers";
import { withPayloadTransaction } from "./payloadTransaction";
import type { AIDocument } from "./repository";

/** Откатывает изменение только после отдельного подтверждения точного rollback hash. */
export const rollbackDataOperation = async (input: {
  dataOperationID: string;
  expectedRollbackHash: string;
  expectedVersion: number;
  payload: Payload;
  req: PayloadRequest;
  userID: number | string;
}): Promise<AIDocument> => {
  const repository = new DataOperationRepository(input.payload, input.req);
  const audit = new DataOperationAuditRepository(input.payload, input.req);
  let operation = await repository.getOwnedOperation(
    input.dataOperationID,
    input.userID,
  );
  if (operation.rollbackHash !== input.expectedRollbackHash) {
    throw new EndpointError("CONFLICT", "Rollback hash mismatch.", 409);
  }
  if (
    operation.state === "rolled_back" &&
    Number(operation.version) === input.expectedVersion + 1
  ) {
    return operation;
  }
  if (
    operation.state !== "rollback_approved" ||
    Number(operation.version) !== input.expectedVersion
  ) {
    throw new EndpointError(
      "CONFLICT",
      "This Data Operation is not approved for rollback.",
      409,
    );
  }
  assertDataOperationApproval({
    approval: await audit.getApproval(
      input.dataOperationID,
      "ROLLBACK_APPROVAL",
    ),
    dataOperationID: input.dataOperationID,
    targetHash: input.expectedRollbackHash,
    type: "ROLLBACK_APPROVAL",
  });

  try {
    operation = await withPayloadTransaction(input.req, async () => {
      const restoredTargetUpdatedAt =
        operation.kind === "pages.updateDraft.v1"
          ? await new PageDraftUpdate(input.payload, input.req).rollback(
              operation,
            )
          : operation.kind === "pages.createDraft.v1"
            ? await new PageDraftCreation(input.payload, input.req).rollback(
                operation,
              )
            : await new CatalogCategoryAssignment(
                input.payload,
                input.req,
              ).rollback({
                afterCategoryIDs: snapshotIDs(operation.afterSnapshot),
                appliedTargetUpdatedAt: String(
                  operation.appliedTargetUpdatedAt || "",
                ),
                beforeCategoryIDs: snapshotIDs(operation.beforeSnapshot),
                productID: relationID(operation.product),
              });
      const transitioned = await repository.transition({
        data: {
          errorSummary: undefined,
          rolledBackAt: new Date().toISOString(),
          state: "rolled_back",
          version: input.expectedVersion + 1,
        },
        expectedState: "rollback_approved",
        expectedVersion: input.expectedVersion,
        id: input.dataOperationID,
      });
      await audit.createEvent({
        actor: input.userID,
        dataOperationID: input.dataOperationID,
        fromState: "rollback_approved",
        idempotencyKey: `rollback:${input.dataOperationID}:${input.expectedVersion}`,
        payload: {
          restoredTargetUpdatedAt,
          rollbackHash: input.expectedRollbackHash,
        },
        toState: "rolled_back",
        type: "rollback_succeeded",
      });
      return transitioned;
    });
    return operation;
  } catch (error) {
    const concurrent = await repository.getOwnedOperation(
      input.dataOperationID,
      input.userID,
    );
    if (
      concurrent.state === "rolled_back" &&
      Number(concurrent.version) === input.expectedVersion + 1
    ) {
      return concurrent;
    }
    await recordDataOperationFailure({
      error,
      expectedState: "rollback_approved",
      expectedVersion: input.expectedVersion,
      id: input.dataOperationID,
      payload: input.payload,
      req: input.req,
      type: "rollback_failed",
      userID: input.userID,
    });
    throw error;
  }
};
