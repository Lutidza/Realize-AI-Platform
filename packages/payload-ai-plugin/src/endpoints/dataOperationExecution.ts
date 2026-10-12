/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationExecution.ts
 * @version 1.3.1
 * @date 2026-10-12
 * @description Атомарно применяет подтверждённую типизированную операцию данных.
 * @docref Realize — AI Platform v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type { ApplyDataOperationInput } from "@realize/ai-contracts";
import type { Payload, PayloadRequest } from "payload";

import { PageDraftCreation } from "./pageDraftCreation.service";
import { PageDraftUpdate } from "./pageDraftUpdate.service";
import { PageDraftStructure } from "./pageDraftStructure.service";
import { CatalogCategoryAssignment } from "./catalogCategoryAssignment";
import { DataOperationAuditRepository } from "./dataOperationAuditRepository";
import {
  assertDataOperationApproval,
  recordDataOperationFailure,
  snapshotIDs,
} from "./dataOperationExecutionSupport";
import { DataOperationRepository } from "./dataOperationRepository";
import { EndpointError } from "./http";
import { PagePublication } from "./pagePublication.service";
import {
  isPagePublicationKind,
  requirePagePublicationAccess,
} from "./pagePublicationAccess.service";
import { assertPagePublicationReviewApproval } from "./pagePublicationApproval.service";
import { createPagePublicationDelivery } from "./pagePublicationDelivery.service";
import { relationID } from "./mappers";
import { withPayloadTransaction } from "./payloadTransaction";
import type { AIDocument } from "./repository";

/** Применяет подтверждённую операцию с Payload access и hooks в общей транзакции. */
export const applyDataOperation = async (input: {
  data: ApplyDataOperationInput;
  dataOperationID: string;
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
  if (isPagePublicationKind(operation.kind))
    await requirePagePublicationAccess(input.req);
  if (operation.operationHash !== input.data.expectedOperationHash) {
    throw new EndpointError("CONFLICT", "Operation hash mismatch.", 409);
  }
  if (
    operation.state === "applied" &&
    Number(operation.version) === input.data.expectedVersion + 1
  ) {
    return operation;
  }
  if (
    operation.state !== "approved" ||
    Number(operation.version) !== input.data.expectedVersion
  ) {
    throw new EndpointError(
      "CONFLICT",
      "This Data Operation is not approved for execution.",
      409,
    );
  }
  const approval = await audit.getApproval(
    input.dataOperationID,
    "WRITE_CONFIRMATION",
  );
  assertDataOperationApproval({
    approval,
    dataOperationID: input.dataOperationID,
    targetHash: input.data.expectedOperationHash,
    type: "WRITE_CONFIRMATION",
  });
  if (isPagePublicationKind(operation.kind))
    assertPagePublicationReviewApproval(operation, approval!);

  try {
    operation = await withPayloadTransaction(input.req, async () => {
      const pageResult = isPagePublicationKind(operation.kind)
        ? await new PagePublication(input.payload, input.req).apply(operation)
        : operation.kind === "pages.updateStructureDraft.v1"
          ? await new PageDraftStructure(input.payload, input.req).apply(
              operation,
            )
          : operation.kind === "pages.updateDraft.v1"
            ? await new PageDraftUpdate(input.payload, input.req).apply(
                operation,
              )
            : operation.kind === "pages.createDraft.v1"
              ? await new PageDraftCreation(input.payload, input.req).apply(
                  operation,
                )
              : undefined;
      if (
        !pageResult &&
        operation.kind !== undefined &&
        operation.kind !== "catalog.assignCategory.v1"
      )
        throw new EndpointError(
          "INVALID_REQUEST",
          "Тип операции данных не поддерживается.",
          400,
        );
      const appliedTargetUpdatedAt =
        pageResult?.appliedSnapshot.updatedAt ??
        (await new CatalogCategoryAssignment(input.payload, input.req).apply({
          afterCategoryIDs: snapshotIDs(operation.afterSnapshot),
          beforeCategoryIDs: snapshotIDs(operation.beforeSnapshot),
          expectedTargetUpdatedAt: String(operation.expectedTargetUpdatedAt),
          productID: relationID(operation.product),
        }));
      const appliedAt = new Date().toISOString();
      const transitioned = await repository.transition({
        data: {
          ...(pageResult ?? {}),
          appliedAt,
          appliedTargetUpdatedAt,
          errorSummary: undefined,
          state: "applied",
          version: input.data.expectedVersion + 1,
        },
        expectedState: "approved",
        expectedVersion: input.data.expectedVersion,
        id: input.dataOperationID,
      });
      await audit.createEvent({
        actor: input.userID,
        dataOperationID: input.dataOperationID,
        fromState: "approved",
        idempotencyKey: `apply:${input.dataOperationID}:${input.data.expectedVersion}`,
        payload: {
          appliedTargetUpdatedAt,
          operationHash: input.data.expectedOperationHash,
        },
        toState: "applied",
        type: "apply_succeeded",
      });
      if (isPagePublicationKind(operation.kind))
        await createPagePublicationDelivery(input.req, transitioned);
      return transitioned;
    });
    return operation;
  } catch (error) {
    const concurrent = await repository.getOwnedOperation(
      input.dataOperationID,
      input.userID,
    );
    if (
      concurrent.state === "applied" &&
      Number(concurrent.version) === input.data.expectedVersion + 1
    ) {
      return concurrent;
    }
    await recordDataOperationFailure({
      error,
      expectedState: "approved",
      expectedVersion: input.data.expectedVersion,
      id: input.dataOperationID,
      payload: input.payload,
      req: input.req,
      type: "apply_failed",
      userID: input.userID,
    });
    throw error;
  }
};
