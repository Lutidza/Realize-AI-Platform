/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationExecutionSupport.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проверяет approval binding и фиксирует terminal execution failures.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import { createDataOperationApprovalBinding } from "@realize/change-engine";
import type { Payload, PayloadRequest } from "payload";

import { DataOperationAuditRepository } from "./dataOperationAuditRepository";
import { DataOperationRepository } from "./dataOperationRepository";
import { EndpointError } from "./http";
import { relationID } from "./mappers";
import { withPayloadTransaction } from "./payloadTransaction";
import { lockAITransaction } from "./lockAITransaction.util";
import type { AIDocument } from "./repository";

export const snapshotIDs = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || !("id" in item)) return [];
    const id = (item as { id?: unknown }).id;
    return typeof id === "string" ? [id] : [];
  });
};

const roleSnapshot = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((role): role is string => typeof role === "string")
    : [];

export const assertDataOperationApproval = (input: {
  approval?: AIDocument;
  dataOperationID: string;
  targetHash: string;
  type: "ROLLBACK_APPROVAL" | "WRITE_CONFIRMATION";
}): AIDocument => {
  const approval = input.approval;
  if (
    !approval ||
    approval.decision !== "approved" ||
    approval.type !== input.type ||
    approval.targetHash !== input.targetHash ||
    Date.parse(String(approval.expiresAt || "")) <= Date.now()
  ) {
    throw new EndpointError(
      "CONFLICT",
      "A valid hash-bound approval is required.",
      409,
    );
  }
  const expectedBinding = createDataOperationApprovalBinding({
    actorID: relationID(approval.actor),
    actorRoles: roleSnapshot(approval.roleSnapshot),
    approvalType: input.type,
    dataOperationID: input.dataOperationID,
    decision: "approved",
    expiresAt: String(approval.expiresAt),
    targetHash: input.targetHash,
    version: Number(approval.operationVersion),
  });
  if (approval.boundHash !== expectedBinding) {
    throw new EndpointError(
      "CONFLICT",
      "The stored approval binding is invalid.",
      409,
    );
  }
  return approval;
};

export const recordDataOperationFailure = async (input: {
  error: unknown;
  expectedState: "approved" | "rollback_approved";
  expectedVersion: number;
  id: string;
  payload: Payload;
  req: PayloadRequest;
  type: "apply_failed" | "rollback_failed";
  userID: number | string;
}): Promise<void> => {
  const repository = new DataOperationRepository(input.payload, input.req);
  const audit = new DataOperationAuditRepository(input.payload, input.req);
  const summary = (
    input.error instanceof EndpointError
      ? input.error.message
      : "Data Operation execution failed."
  ).slice(0, 1_000);
  try {
    await withPayloadTransaction(input.req, async () => {
      const operation = await repository.getOwnedOperation(
        input.id,
        input.userID,
      );
      if (
        typeof operation.kind === "string" &&
        operation.kind.startsWith("pages.")
      ) {
        await lockAITransaction(input.req, "page-drafts");
        const current = await repository.getOwnedOperation(
          input.id,
          input.userID,
        );
        if (
          current.state !== input.expectedState ||
          current.version !== input.expectedVersion
        )
          return;
      }
      await repository.transition({
        data: {
          errorSummary: summary,
          state: input.type,
          version: input.expectedVersion + 1,
        },
        expectedState: input.expectedState,
        expectedVersion: input.expectedVersion,
        id: input.id,
      });
      await audit.createEvent({
        actor: input.userID,
        dataOperationID: input.id,
        fromState: input.expectedState,
        idempotencyKey: `${input.type}:${input.id}:${input.expectedVersion}`,
        payload: { errorSummary: summary },
        toState: input.type,
        type: input.type,
      });
    });
  } catch {
    // A concurrent successful transition owns the durable result.
  }
};
