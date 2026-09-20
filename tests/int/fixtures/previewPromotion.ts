/**
 * @file tests/int/fixtures/previewPromotion.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Создаёт синтетический принятый diff и завершённую неуспешную попытку preview.
 */
import { createImplementationAcceptanceBinding } from "@realize/change-engine";
import type { AIDocument } from "../../../packages/payload-ai-plugin/src/endpoints/repository";

export const previewPromotionFixture = () => {
  const expiresAt = "2099-01-02T00:00:00.000Z";
  const change: AIDocument = {
    id: 18,
    conversation: 2,
    version: 15,
    state: "preview_failed",
    blockedReason: "Chromium unavailable",
    planHash: "p".repeat(64),
    scopeHash: "s".repeat(64),
  };
  const job: AIDocument = {
    id: 16,
    changeRequest: 18,
    status: "completed",
    baseCommit: "a".repeat(40),
    diff: "accepted diff",
    diffTruncated: false,
    diffHash: "d".repeat(64),
    evidenceHash: "e".repeat(64),
    artifactsExpireAt: expiresAt,
    checks: ["npm run typecheck"],
  };
  const acceptance: AIDocument = {
    id: 22,
    changeRequest: 18,
    actor: 7,
    roleSnapshot: ["admin"],
    decision: "approved",
    decisionKey: "18:7:IMPLEMENTATION_ACCEPTANCE",
    diffHash: job.diffHash,
    expiresAt,
    boundHash: createImplementationAcceptanceBinding({
      actorID: "7",
      actorRoles: ["admin"],
      changeRequestID: "18",
      decision: "approved",
      diffHash: String(job.diffHash),
      evidenceHash: String(job.evidenceHash),
      expiresAt,
      planHash: String(change.planHash),
      scopeHash: String(change.scopeHash),
      version: 7,
    }),
  };
  const deployment: AIDocument = {
    id: 4,
    changeRequest: 18,
    executionJob: 16,
    status: "failed",
    runtimeState: "stopped",
    baseCommit: job.baseCommit,
    sourceDiffHash: job.diffHash,
    sourceEvidenceHash: job.evidenceHash,
    boundImplementationHash: acceptance.boundHash,
    deploymentKey: "previous-deployment-key",
    idempotencyKey: "previous-request",
    expiresAt: "2099-01-01T00:00:00.000Z",
    branch: "ai/preview-original",
    workspaceID: "preview-original",
    initiatedBy: 7,
  };
  return { acceptance, change, deployment, job };
};
