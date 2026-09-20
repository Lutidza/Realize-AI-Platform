/**
 * @file packages/payload-ai-plugin/src/endpoints/previewHandlers.ts
 * @version 1.2.0
 * @date 2026-09-17
 * @description Ставит accepted diffs в local preview и фиксирует preview decisions.
 */

import {
  parseAcceptPreviewInput,
  parseDeployPreviewInput,
  parseIdentifier,
  parseRejectPreviewInput,
} from "@realize/ai-contracts";
import { createPreviewAcceptanceBinding } from "@realize/change-engine";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import { requireCodexChatTool } from "./requireCodexChatTool.service";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { consumeRateLimit, requireChatUser } from "./access";
import { ChangeRepository } from "./changeRepository";
import { projectChangeRequest } from "./changeProjection";
import { DeploymentRepository } from "./deploymentRepository";
import { ExecutionRepository } from "./executionRepository";
import { EndpointError, success } from "./http";
import { relationID, toPreviewDeploymentDTO } from "./mappers";
import { idempotencyKeyFor, readBody, withHandler } from "./request";
import { ReleaseRepository } from "./releaseRepository";
import { SourcePromotionRepository } from "./sourcePromotionRepository";
import { queuePreviewPromotion } from "./queuePreviewPromotion.service";

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const rolesOf = (user: unknown): string[] => {
  const roles = (user as { roles?: unknown } | null)?.roles;
  return stringArray(roles);
};

const project = async (input: {
  changeRequestID: string;
  options: SanitizedRealizeAIPluginOptions;
  req: Parameters<PayloadEndpointHandler>[0];
  userID: number | string;
}) => {
  const changeRepository = new ChangeRepository(input.req.payload, input.req);
  const executionRepository = new ExecutionRepository(
    input.req.payload,
    input.req,
  );
  const deploymentRepository = new DeploymentRepository(
    input.req.payload,
    input.req,
  );
  const [change, approval, acceptance, previewAcceptance, releaseApproval] =
    await Promise.all([
      changeRepository.getOwnedChange(input.changeRequestID, input.userID),
      changeRepository.getApproval(input.changeRequestID),
      changeRepository.getApproval(
        input.changeRequestID,
        "IMPLEMENTATION_ACCEPTANCE",
      ),
      changeRepository.getApproval(input.changeRequestID, "PREVIEW_ACCEPTANCE"),
      changeRepository.getApproval(input.changeRequestID, "RELEASE_APPROVAL"),
    ]);
  return await projectChangeRequest({
    acceptance,
    approval,
    change,
    deploymentRepository,
    executionRepository,
    options: input.options,
    previewAcceptance,
    releaseApproval,
    releaseRepository: new ReleaseRepository(input.req.payload, input.req),
    sourcePromotionRepository: new SourcePromotionRepository(
      input.req.payload,
      input.req,
    ),
  });
};

const previewDecisionHandler = (
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
        ? parseAcceptPreviewInput(body)
        : parseRejectPreviewInput(body);
    const changeRepository = new ChangeRepository(req.payload, req);
    const deploymentRepository = new DeploymentRepository(req.payload, req);
    const change = await changeRepository.getOwnedChange(
      changeRequestID,
      user.id,
    );
    const deployment =
      await deploymentRepository.getLatestDeployment(changeRequestID);
    let acceptance = await changeRepository.getApproval(
      changeRequestID,
      "PREVIEW_ACCEPTANCE",
    );

    if (!deployment) {
      throw new EndpointError(
        "CONFLICT",
        "A ready preview deployment is required.",
        409,
      );
    }
    if (acceptance) {
      if (acceptance.decision !== decision) {
        throw new EndpointError(
          "CONFLICT",
          "This preview already has the opposite decision.",
          409,
        );
      }
      return success(
        await project({ changeRequestID, options, req, userID: user.id }),
        correlationID,
      );
    }
    if (
      change.state !== "preview_ready" ||
      deployment.status !== "ready" ||
      !deployment.artifactHash ||
      !deployment.commitSHA ||
      !deployment.evidenceHash ||
      !deployment.reviewEvidenceHash ||
      deployment.reviewStatus !== "approved"
    ) {
      throw new EndpointError(
        "CONFLICT",
        "Only a healthy, independently reviewed preview can be decided.",
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
    if (deployment.artifactHash !== input.expectedArtifactHash) {
      throw new EndpointError(
        "CONFLICT",
        "The preview artifact no longer matches the reviewed hash.",
        409,
      );
    }
    const expiresAt = String(deployment.expiresAt || "");
    if (Date.parse(expiresAt) <= Date.now()) {
      throw new EndpointError(
        "CONFLICT",
        "The local preview has expired.",
        409,
      );
    }

    const boundHash = createPreviewAcceptanceBinding({
      actorID: String(user.id),
      actorRoles: rolesOf(user),
      artifactHash: String(deployment.artifactHash),
      changeRequestID,
      commitSHA: String(deployment.commitSHA),
      decision,
      environment: "local-preview",
      evidenceHash: String(deployment.evidenceHash),
      expiresAt,
      reviewerEvidenceHash: String(deployment.reviewEvidenceHash),
      sourceDiffHash: String(deployment.sourceDiffHash),
      version: input.expectedVersion,
    });
    try {
      acceptance = await changeRepository.createApproval({
        actor: user.id,
        artifactHash: String(deployment.artifactHash),
        boundHash,
        changeRequestID,
        comment: input.comment,
        decision,
        decisionKey: `${changeRequestID}:${input.expectedVersion}:PREVIEW_ACCEPTANCE`,
        expiresAt,
        idempotencyKey,
        roles: rolesOf(user),
        targetEnvironment: "local-preview",
        type: "PREVIEW_ACCEPTANCE",
      });
    } catch (error) {
      acceptance = await changeRepository.getApproval(
        changeRequestID,
        "PREVIEW_ACCEPTANCE",
      );
      if (!acceptance) throw error;
    }
    await deploymentRepository.updateDecision(
      String(deployment.id),
      decision === "approved" ? "accepted" : "rejected",
    );
    await changeRepository.updateState(changeRequestID, {
      blockedReason: decision === "rejected" ? input.comment : undefined,
      state: decision === "approved" ? "preview_accepted" : "blocked",
      version: input.expectedVersion + 1,
    });
    return success(
      await project({ changeRequestID, options, req, userID: user.id }),
      correlationID,
    );
  });

/** Creates accepted-diff promotion and preview acceptance endpoints. */
export const createPreviewHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  accept: PayloadEndpointHandler;
  deploy: PayloadEndpointHandler;
  detail: PayloadEndpointHandler;
  reject: PayloadEndpointHandler;
} => ({
  accept: previewDecisionHandler(options, "approved"),

  deploy: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    if (!options.execution.enabled || !options.preview.enabled) {
      throw new EndpointError(
        "AI_DISABLED",
        "Local preview promotion is disabled.",
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
    const input = parseDeployPreviewInput(await readBody(req));
    const created = await queuePreviewPromotion({
      changeRequestID,
      idempotencyKey,
      request: input,
      req,
      ttlSeconds: options.preview.ttlSeconds,
      userID: user.id,
    });
    return success(
      await project({ changeRequestID, options, req, userID: user.id }),
      correlationID,
      created ? 202 : 200,
    );
  }),

  detail: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    const deploymentID = parseIdentifier(req.routeParams?.id, "deployment id");
    const changeRepository = new ChangeRepository(req.payload, req);
    const deploymentRepository = new DeploymentRepository(req.payload, req);
    const deployment = await deploymentRepository.getDeployment(deploymentID);
    if (!deployment) {
      throw new EndpointError(
        "NOT_FOUND",
        "Preview deployment was not found.",
        404,
      );
    }
    const changeRequestID = relationID(deployment.changeRequest);
    if (!changeRequestID) {
      throw new EndpointError(
        "INTERNAL_ERROR",
        "Preview deployment has no owning Change Request.",
        500,
      );
    }
    await changeRepository.getOwnedChange(changeRequestID, user.id);
    const checks = await deploymentRepository.listCheckResults(deploymentID);
    return success(toPreviewDeploymentDTO(deployment, checks), correlationID);
  }),

  reject: previewDecisionHandler(options, "rejected"),
});
