/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationDecisionSupport.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет actor roles и идемпотентный replay решений DataOperation.
 * @docref Realize — AI Platform v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import { EndpointError } from "./http";
import type { AIDocument } from "./repository";

export const dataOperationActorRoles = (user: unknown): string[] => {
  const roles = (user as { roles?: unknown } | null)?.roles;
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === "string")
    : [];
};

/** Accepts only an identical decision replay for the requested aggregate version. */
export const assertDataOperationDecisionReplay = (input: {
  approval: AIDocument;
  decision: "approved" | "rejected";
  expectedVersion: number;
  operation: AIDocument;
  targetHash: string;
  type: "ROLLBACK_APPROVAL" | "WRITE_CONFIRMATION";
}): void => {
  if (
    input.approval.decision !== input.decision ||
    input.approval.type !== input.type ||
    input.approval.targetHash !== input.targetHash ||
    Number(input.approval.operationVersion) !== input.expectedVersion ||
    ![input.expectedVersion, input.expectedVersion + 1].includes(
      Number(input.operation.version),
    )
  ) {
    throw new EndpointError(
      "CONFLICT",
      "A different decision is already bound to this Data Operation version.",
      409,
    );
  }
};
