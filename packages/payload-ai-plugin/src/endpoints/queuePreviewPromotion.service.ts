/**
 * @file packages/payload-ai-plugin/src/endpoints/queuePreviewPromotion.service.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Атомарно ставит принятый diff в новую попытку preview без изменения прежней истории.
 */

import { randomUUID } from "node:crypto";
import type { DeployPreviewInput } from "@realize/ai-contracts";
import { PREVIEW_REQUIRED_CHECKS } from "@realize/change-engine";
import type { PayloadRequest } from "payload";

import { ChangeRepository } from "./changeRepository";
import { DeploymentRepository } from "./deploymentRepository";
import { ExecutionRepository } from "./executionRepository";
import { EndpointError } from "./http";
import { relationID } from "./mappers";
import { withPayloadTransaction } from "./payloadTransaction";
import { previewPromotionReason } from "./previewPromotionGuard";

/** Возвращает false для точного idempotent replay и true для новой durable попытки. */
export const queuePreviewPromotion = async (input: {
  changeRequestID: string;
  idempotencyKey: string;
  request: DeployPreviewInput;
  req: PayloadRequest;
  ttlSeconds: number;
  userID: number | string;
}): Promise<boolean> => {
  const { changeRequestID, idempotencyKey, req, request, userID } = input;
  const changes = new ChangeRepository(req.payload, req);
  const deployments = new DeploymentRepository(req.payload, req);
  const executions = new ExecutionRepository(req.payload, req);
  // Проверка владельца предшествует SQL lock, чтобы чужой CR нельзя было блокировать.
  await changes.getOwnedChange(changeRequestID, userID);
  return await withPayloadTransaction(req, async () => {
    await deployments.lockChangeRequest(changeRequestID);
    const change = await changes.getOwnedChange(changeRequestID, userID);
    const replay = await deployments.findByIdempotencyKey(
      userID,
      idempotencyKey,
    );
    if (replay) {
      if (
        relationID(replay.changeRequest) !== changeRequestID ||
        replay.sourceDiffHash !== request.expectedDiffHash
      )
        throw new EndpointError(
          "CONFLICT",
          "Idempotency key belongs to another preview request.",
          409,
        );
      return false;
    }
    if (Number(change.version) !== request.expectedVersion)
      throw new EndpointError(
        "CONFLICT",
        "The Change Request version has changed. Reload before promotion.",
        409,
      );
    const deployment = await deployments.getLatestDeployment(changeRequestID);
    const job = await executions.getLatestJob(changeRequestID);
    const acceptance = await changes.getApproval(
      changeRequestID,
      "IMPLEMENTATION_ACCEPTANCE",
    );
    const previewAcceptance = await changes.getApproval(
      changeRequestID,
      "PREVIEW_ACCEPTANCE",
    );
    const now = Date.now();
    const reason = previewPromotionReason({
      acceptance,
      change,
      deployment,
      job,
      now,
      previewAcceptance,
    });
    if (reason || !job || !acceptance)
      throw new EndpointError(
        "CONFLICT",
        reason || "Accepted artifact is unavailable.",
        409,
      );
    if (job.diffHash !== request.expectedDiffHash)
      throw new EndpointError(
        "CONFLICT",
        "The accepted diff no longer matches the requested promotion.",
        409,
      );

    const deploymentKey = randomUUID();
    const suffix = deploymentKey.replaceAll("-", "").slice(0, 16);
    const requiredChecks = [
      ...new Set([
        ...PREVIEW_REQUIRED_CHECKS,
        ...(Array.isArray(job.checks)
          ? job.checks.filter(
              (command): command is string =>
                typeof command === "string" && command !== "npm run test:e2e",
            )
          : []),
      ]),
    ];
    // Новый runtime получает собственный TTL в пределах исходного artifact и approval.
    const expiresAt = new Date(
      Math.min(
        now + input.ttlSeconds * 1_000,
        Date.parse(String(job.artifactsExpireAt)),
        Date.parse(String(acceptance.expiresAt)),
      ),
    ).toISOString();
    await deployments.queueChangeRequest({
      changeRequestID,
      expectedState: String(change.state),
      expectedVersion: request.expectedVersion,
    });
    await deployments.createDeployment({
      baseCommit: String(job.baseCommit),
      boundImplementationHash: String(acceptance.boundHash),
      branch: `ai/preview-${suffix}`,
      changeRequestID,
      deploymentKey,
      executionJobID: String(job.id),
      expiresAt,
      idempotencyKey,
      initiatedBy: userID,
      requiredChecks,
      sourceDiffHash: String(job.diffHash),
      sourceEvidenceHash: String(job.evidenceHash),
      workspaceID: `preview-${suffix}`,
    });
    return true;
  });
};
