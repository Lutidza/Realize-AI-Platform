/**
 * @file packages/payload-ai-plugin/src/endpoints/executionHandlers.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Ставит approved code jobs в очередь и фиксирует human acceptance.
 */

import { randomUUID } from "node:crypto";

import {
  parseAcceptImplementationInput,
  parseExecuteChangeInput,
  parseIdentifier,
  parseRejectImplementationInput,
} from "@realize/ai-contracts";
import {
  assessExecutionScope,
  createExecutionCapability,
  createImplementationAcceptanceBinding,
  createPlanApprovalBinding,
  issueExecutionCapability,
} from "@realize/change-engine";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import { requireCodexChatTool } from "./requireCodexChatTool.service";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { consumeRateLimit, requireChatUser } from "./access";
import { projectChangeRequest } from "./changeProjection";
import { ChangeRepository } from "./changeRepository";
import { DeploymentRepository } from "./deploymentRepository";
import { ExecutionRepository } from "./executionRepository";
import { resolveExecutionBaseCommit } from "./gitRepository";
import { EndpointError, success } from "./http";
import { relationID } from "./mappers";
import { idempotencyKeyFor, readBody, withHandler } from "./request";
import { ReleaseRepository } from "./releaseRepository";
import { SourcePromotionRepository } from "./sourcePromotionRepository";

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const rolesOf = (user: unknown): string[] => {
  const roles = (user as { roles?: unknown } | null)?.roles;
  return stringArray(roles);
};

const signingSecret = (options: SanitizedRealizeAIPluginOptions): string => {
  const value = process.env[options.execution.signingSecretEnv] || "";
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new EndpointError(
      "AI_RUNTIME_UNAVAILABLE",
      "Execution signing secret is missing or too short.",
      503,
    );
  }
  return value;
};

const requirePlanApprovalBinding = (input: {
  approval: Record<string, unknown>;
  approvedVersion: number;
  change: Record<string, unknown>;
  changeRequestID: string;
}): void => {
  const expected = createPlanApprovalBinding({
    actorID: relationID(input.approval.actor),
    actorRoles: stringArray(input.approval.roleSnapshot),
    changeRequestID: input.changeRequestID,
    decision: "approved",
    expiresAt: String(input.approval.expiresAt || ""),
    planHash: String(input.change.planHash || ""),
    scopeHash: String(input.change.scopeHash || ""),
    version: input.approvedVersion,
  });
  if (
    input.approval.decision !== "approved" ||
    input.approval.boundHash !== expected
  ) {
    throw new EndpointError(
      "CONFLICT",
      "Stored plan approval does not match the current plan and scope.",
      409,
    );
  }
};

const acceptanceHandler = (
  options: SanitizedRealizeAIPluginOptions,
  decision: "approved" | "rejected",
): PayloadEndpointHandler =>
  withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    if (decision === "approved")
      await requireCodexChatTool(req, "codeChanges", options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const changeRequestID = parseIdentifier(
      req.routeParams?.id,
      "change request id",
    );
    const body = await readBody(req);
    const input =
      decision === "approved"
        ? parseAcceptImplementationInput(body)
        : parseRejectImplementationInput(body);
    const repository = new ChangeRepository(req.payload, req);
    const executionRepository = new ExecutionRepository(req.payload, req);
    const deploymentRepository = new DeploymentRepository(req.payload, req);
    let change = await repository.getOwnedChange(changeRequestID, user.id);
    const approval = await repository.getApproval(changeRequestID);
    let acceptance = await repository.getApproval(
      changeRequestID,
      "IMPLEMENTATION_ACCEPTANCE",
    );
    const job = await executionRepository.getLatestJob(changeRequestID);

    if (!approval || !job) {
      throw new EndpointError(
        "CONFLICT",
        "Verified implementation evidence is not available.",
        409,
      );
    }
    if (acceptance) {
      if (acceptance.decision !== decision) {
        throw new EndpointError(
          "CONFLICT",
          "This implementation already has the opposite decision.",
          409,
        );
      }
      return success(
        await projectChangeRequest({
          acceptance,
          approval,
          change,
          deploymentRepository,
          executionRepository,
          options,
          releaseRepository: new ReleaseRepository(req.payload, req),
          sourcePromotionRepository: new SourcePromotionRepository(
            req.payload,
            req,
          ),
        }),
        correlationID,
      );
    }
    if (
      change.state !== "changes_ready" ||
      job.status !== "completed" ||
      !job.diffHash ||
      !job.evidenceHash
    ) {
      throw new EndpointError(
        "CONFLICT",
        "Only a completed and verified diff can be accepted.",
        409,
      );
    }
    if (Number(change.version) !== input.expectedVersion) {
      throw new EndpointError(
        "CONFLICT",
        "The Change Request version has changed. Reload before deciding.",
        409,
      );
    }
    if (job.diffHash !== input.expectedDiffHash) {
      throw new EndpointError(
        "CONFLICT",
        "The produced diff no longer matches the reviewed hash.",
        409,
      );
    }
    const expiresAt = String(job.artifactsExpireAt || "");
    if (Date.parse(expiresAt) <= Date.now()) {
      throw new EndpointError(
        "CONFLICT",
        "The isolated implementation artifacts have expired.",
        409,
      );
    }

    const boundHash = createImplementationAcceptanceBinding({
      actorID: String(user.id),
      actorRoles: rolesOf(user),
      changeRequestID,
      decision,
      diffHash: String(job.diffHash),
      evidenceHash: String(job.evidenceHash),
      expiresAt,
      planHash: String(change.planHash || ""),
      scopeHash: String(change.scopeHash || ""),
      version: input.expectedVersion,
    });
    try {
      acceptance = await repository.createApproval({
        actor: user.id,
        boundHash,
        changeRequestID,
        comment: input.comment,
        decision,
        decisionKey: `${changeRequestID}:${input.expectedVersion}:IMPLEMENTATION_ACCEPTANCE`,
        diffHash: String(job.diffHash),
        expiresAt,
        idempotencyKey,
        roles: rolesOf(user),
        type: "IMPLEMENTATION_ACCEPTANCE",
      });
    } catch (error) {
      acceptance = await repository.getApproval(
        changeRequestID,
        "IMPLEMENTATION_ACCEPTANCE",
      );
      if (!acceptance) throw error;
    }
    change = await repository.updateState(changeRequestID, {
      blockedReason: decision === "rejected" ? input.comment : undefined,
      state: decision === "approved" ? "changes_accepted" : "blocked",
      version: input.expectedVersion + 1,
    });
    return success(
      await projectChangeRequest({
        acceptance,
        approval,
        change,
        deploymentRepository,
        executionRepository,
        options,
        releaseRepository: new ReleaseRepository(req.payload, req),
        sourcePromotionRepository: new SourcePromotionRepository(
          req.payload,
          req,
        ),
      }),
      correlationID,
    );
  });

/** Creates the code execution and implementation acceptance endpoints. */
export const createExecutionHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  accept: PayloadEndpointHandler;
  execute: PayloadEndpointHandler;
  reject: PayloadEndpointHandler;
} => ({
  accept: acceptanceHandler(options, "approved"),

  execute: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    if (!options.execution.enabled) {
      throw new EndpointError(
        "AI_DISABLED",
        "Isolated code execution is disabled.",
        409,
      );
    }
    await requireCodexChatTool(req, "codeChanges", options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const changeRequestID = parseIdentifier(
      req.routeParams?.id,
      "change request id",
    );
    const input = parseExecuteChangeInput(await readBody(req));
    const repository = new ChangeRepository(req.payload, req);
    const executionRepository = new ExecutionRepository(req.payload, req);
    const deploymentRepository = new DeploymentRepository(req.payload, req);
    let change = await repository.getOwnedChange(changeRequestID, user.id);
    const approval = await repository.getApproval(changeRequestID);
    const existing = await executionRepository.getLatestJob(changeRequestID);
    if (existing) {
      return success(
        await projectChangeRequest({
          approval,
          change,
          deploymentRepository,
          executionRepository,
          options,
          releaseRepository: new ReleaseRepository(req.payload, req),
          sourcePromotionRepository: new SourcePromotionRepository(
            req.payload,
            req,
          ),
        }),
        correlationID,
      );
    }
    if (!approval || change.state !== "plan_approved") {
      throw new EndpointError(
        "CONFLICT",
        "An active exact plan approval is required before execution.",
        409,
      );
    }
    if (Number(change.version) !== input.expectedVersion) {
      throw new EndpointError(
        "CONFLICT",
        "The Change Request version has changed. Reload before execution.",
        409,
      );
    }
    if (Date.parse(String(approval.expiresAt || "")) <= Date.now()) {
      throw new EndpointError(
        "CONFLICT",
        "The plan approval has expired.",
        409,
      );
    }
    const approvedVersion = input.expectedVersion - 1;
    if (approvedVersion < 1) {
      throw new EndpointError("CONFLICT", "Approved version is invalid.", 409);
    }
    requirePlanApprovalBinding({
      approval,
      approvedVersion,
      change,
      changeRequestID,
    });

    const affectedPaths = stringArray(change.affectedPaths);
    const checks = stringArray(change.checks);
    const assessment = assessExecutionScope({
      affectedPaths,
      checks,
      type: String(change.type || ""),
    });
    if (!assessment.allowed) {
      throw new EndpointError("FORBIDDEN", assessment.reason, 403);
    }

    const baseCommit = await resolveExecutionBaseCommit(
      options.execution.repositoryRoot,
    );
    const executionKey = randomUUID();
    const suffix = executionKey.replaceAll("-", "").slice(0, 16);
    const branch = `ai/change-${suffix}`;
    const workspaceID = `change-${suffix}`;
    const claims = createExecutionCapability({
      allowedPaths: affectedPaths,
      baseCommit,
      changeRequestID,
      checks,
      executionKey,
      planHash: String(change.planHash || ""),
      scopeHash: String(change.scopeHash || ""),
      ttlSeconds: options.execution.capabilityTTLSeconds,
      version: approvedVersion,
    });
    const capability = issueExecutionCapability(claims, signingSecret(options));
    const artifactsExpireAt = new Date(
      Date.now() + options.execution.artifactsTTLSeconds * 1_000,
    ).toISOString();
    try {
      await executionRepository.createJob({
        allowedPaths: affectedPaths,
        approvedVersion,
        artifactsExpireAt,
        baseCommit,
        boundPlanHash: String(change.planHash || ""),
        boundScopeHash: String(change.scopeHash || ""),
        branch,
        capabilityExpiresAt: claims.expiresAt,
        capabilityIssuedAt: claims.issuedAt,
        capabilityNonce: claims.nonce,
        capabilityTokenHash: capability.tokenHash,
        changeRequestID,
        checks,
        executionKey,
        idempotencyKey,
        requestedBy: user.id,
        workspaceID,
      });
    } catch (error) {
      const concurrent =
        (await executionRepository.getLatestJob(changeRequestID)) ||
        (await executionRepository.findByIdempotencyKey(
          user.id,
          idempotencyKey,
        ));
      if (
        !concurrent ||
        relationID(concurrent.changeRequest) !== changeRequestID
      ) {
        throw error;
      }
    }
    change = await repository.updateState(changeRequestID, {
      state: "execution_queued",
      version: input.expectedVersion + 1,
    });
    return success(
      await projectChangeRequest({
        approval,
        change,
        deploymentRepository,
        executionRepository,
        options,
        releaseRepository: new ReleaseRepository(req.payload, req),
        sourcePromotionRepository: new SourcePromotionRepository(
          req.payload,
          req,
        ),
      }),
      correlationID,
      202,
    );
  }),

  reject: acceptanceHandler(options, "rejected"),
});
