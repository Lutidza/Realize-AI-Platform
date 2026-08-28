/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationDecisions.ts
 * @version 2026-08-28
 * @description Сохраняет hash-bound write и rollback decisions DataOperation.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type { DecideDataOperationInput } from "@realize/ai-contracts";
import { createDataOperationApprovalBinding } from "@realize/change-engine";
import type { Payload, PayloadRequest } from "payload";

import { DataOperationAuditRepository } from "./dataOperationAuditRepository";
import {
  assertDataOperationDecisionReplay,
  dataOperationActorRoles,
} from "./dataOperationDecisionSupport";
import { DataOperationRepository } from "./dataOperationRepository";
import { EndpointError } from "./http";
import { withPayloadTransaction } from "./payloadTransaction";
import type { AIDocument } from "./repository";

/** Approves or rejects the exact operation hash produced by dry-run. */
export const decideDataOperation = async (input: {
  data: DecideDataOperationInput;
  decision: "approved" | "rejected";
  idempotencyKey: string;
  payload: Payload;
  req: PayloadRequest;
  user: NonNullable<PayloadRequest["user"]>;
  dataOperationID: string;
}): Promise<AIDocument> => {
  const repository = new DataOperationRepository(input.payload, input.req);
  const audit = new DataOperationAuditRepository(input.payload, input.req);
  let operation = await repository.getOwnedOperation(
    input.dataOperationID,
    input.user.id,
  );
  if (operation.operationHash !== input.data.expectedOperationHash) {
    throw new EndpointError(
      "CONFLICT",
      "The dry-run operation hash no longer matches the request.",
      409,
    );
  }
  const existing = await audit.getApproval(
    input.dataOperationID,
    "WRITE_CONFIRMATION",
  );
  if (existing) {
    assertDataOperationDecisionReplay({
      approval: existing,
      decision: input.decision,
      expectedVersion: input.data.expectedVersion,
      operation,
      targetHash: input.data.expectedOperationHash,
      type: "WRITE_CONFIRMATION",
    });
    return operation;
  }
  if (
    operation.state !== "awaiting_approval" ||
    Number(operation.version) !== input.data.expectedVersion
  ) {
    throw new EndpointError(
      "CONFLICT",
      "This Data Operation is not awaiting this decision version.",
      409,
    );
  }
  const expiresAt = String(operation.expiresAt || "");
  if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
    throw new EndpointError(
      "CONFLICT",
      "The Data Operation approval window has expired.",
      409,
    );
  }
  const actorRoles = dataOperationActorRoles(input.user);
  const boundHash = createDataOperationApprovalBinding({
    actorID: String(input.user.id),
    actorRoles,
    approvalType: "WRITE_CONFIRMATION",
    dataOperationID: input.dataOperationID,
    decision: input.decision,
    expiresAt,
    targetHash: input.data.expectedOperationHash,
    version: input.data.expectedVersion,
  });

  try {
    operation = await withPayloadTransaction(input.req, async () => {
      await audit.createApproval({
        actor: input.user.id,
        boundHash,
        comment: input.data.comment,
        dataOperationID: input.dataOperationID,
        decision: input.decision,
        decisionKey: `${input.dataOperationID}:${input.data.expectedVersion}:WRITE_CONFIRMATION`,
        expiresAt,
        idempotencyKey: input.idempotencyKey,
        operationVersion: input.data.expectedVersion,
        roles: actorRoles,
        targetHash: input.data.expectedOperationHash,
        type: "WRITE_CONFIRMATION",
      });
      const nextState = input.decision === "approved" ? "approved" : "rejected";
      const transitioned = await repository.transition({
        data: {
          errorSummary: undefined,
          state: nextState,
          version: input.data.expectedVersion + 1,
        },
        expectedState: "awaiting_approval",
        expectedVersion: input.data.expectedVersion,
        id: input.dataOperationID,
      });
      await audit.createEvent({
        actor: input.user.id,
        dataOperationID: input.dataOperationID,
        fromState: "awaiting_approval",
        idempotencyKey: `decision:${input.dataOperationID}:${input.data.expectedVersion}`,
        payload: {
          boundHash,
          decision: input.decision,
          operationHash: input.data.expectedOperationHash,
        },
        toState: nextState,
        type:
          input.decision === "approved" ? "write_approved" : "write_rejected",
      });
      return transitioned;
    });
    return operation;
  } catch (error) {
    operation = await repository.getOwnedOperation(
      input.dataOperationID,
      input.user.id,
    );
    const concurrent = await audit.getApproval(
      input.dataOperationID,
      "WRITE_CONFIRMATION",
    );
    if (!concurrent) throw error;
    assertDataOperationDecisionReplay({
      approval: concurrent,
      decision: input.decision,
      expectedVersion: input.data.expectedVersion,
      operation,
      targetHash: input.data.expectedOperationHash,
      type: "WRITE_CONFIRMATION",
    });
    return operation;
  }
};

/** Approves the compensating snapshot after a successful apply. */
export const approveDataOperationRollback = async (input: {
  comment?: string;
  expectedRollbackHash: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Payload;
  req: PayloadRequest;
  user: NonNullable<PayloadRequest["user"]>;
  dataOperationID: string;
}): Promise<AIDocument> => {
  const repository = new DataOperationRepository(input.payload, input.req);
  const audit = new DataOperationAuditRepository(input.payload, input.req);
  let operation = await repository.getOwnedOperation(
    input.dataOperationID,
    input.user.id,
  );
  if (operation.rollbackHash !== input.expectedRollbackHash) {
    throw new EndpointError(
      "CONFLICT",
      "The rollback snapshot hash no longer matches the request.",
      409,
    );
  }
  const existing = await audit.getApproval(
    input.dataOperationID,
    "ROLLBACK_APPROVAL",
  );
  if (existing) {
    assertDataOperationDecisionReplay({
      approval: existing,
      decision: "approved",
      expectedVersion: input.expectedVersion,
      operation,
      targetHash: input.expectedRollbackHash,
      type: "ROLLBACK_APPROVAL",
    });
    return operation;
  }
  if (
    operation.state !== "applied" ||
    Number(operation.version) !== input.expectedVersion
  ) {
    throw new EndpointError(
      "CONFLICT",
      "Only an applied Data Operation can receive rollback approval.",
      409,
    );
  }
  const actorRoles = dataOperationActorRoles(input.user);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  const boundHash = createDataOperationApprovalBinding({
    actorID: String(input.user.id),
    actorRoles,
    approvalType: "ROLLBACK_APPROVAL",
    dataOperationID: input.dataOperationID,
    decision: "approved",
    expiresAt,
    targetHash: input.expectedRollbackHash,
    version: input.expectedVersion,
  });

  try {
    operation = await withPayloadTransaction(input.req, async () => {
      await audit.createApproval({
        actor: input.user.id,
        boundHash,
        comment: input.comment,
        dataOperationID: input.dataOperationID,
        decision: "approved",
        decisionKey: `${input.dataOperationID}:${input.expectedVersion}:ROLLBACK_APPROVAL`,
        expiresAt,
        idempotencyKey: input.idempotencyKey,
        operationVersion: input.expectedVersion,
        roles: actorRoles,
        targetHash: input.expectedRollbackHash,
        type: "ROLLBACK_APPROVAL",
      });
      const transitioned = await repository.transition({
        data: {
          state: "rollback_approved",
          version: input.expectedVersion + 1,
        },
        expectedState: "applied",
        expectedVersion: input.expectedVersion,
        id: input.dataOperationID,
      });
      await audit.createEvent({
        actor: input.user.id,
        dataOperationID: input.dataOperationID,
        fromState: "applied",
        idempotencyKey: `rollback-approval:${input.dataOperationID}:${input.expectedVersion}`,
        payload: { boundHash, rollbackHash: input.expectedRollbackHash },
        toState: "rollback_approved",
        type: "rollback_approved",
      });
      return transitioned;
    });
    return operation;
  } catch (error) {
    operation = await repository.getOwnedOperation(
      input.dataOperationID,
      input.user.id,
    );
    const concurrent = await audit.getApproval(
      input.dataOperationID,
      "ROLLBACK_APPROVAL",
    );
    if (!concurrent) throw error;
    assertDataOperationDecisionReplay({
      approval: concurrent,
      decision: "approved",
      expectedVersion: input.expectedVersion,
      operation,
      targetHash: input.expectedRollbackHash,
      type: "ROLLBACK_APPROVAL",
    });
    return operation;
  }
};
