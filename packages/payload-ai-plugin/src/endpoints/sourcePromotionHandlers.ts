/**
 * @file packages/payload-ai-plugin/src/endpoints/sourcePromotionHandlers.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Создаёт accepted-preview source promotion и отдаёт redacted PR evidence.
 */

import {
  parseIdentifier,
  parsePublishPullRequestInput,
} from "@realize/ai-contracts";
import {
  assessSourcePromotionDestination,
  createSourcePromotionHeadBranch,
  createSourcePromotionKey,
} from "@realize/change-engine";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import { requireCodexChatTool } from "./requireCodexChatTool.service";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { consumeRateLimit, requireChatUser } from "./access";
import { ChangeRepository } from "./changeRepository";
import { projectChangeRequest } from "./changeProjection";
import { DeploymentRepository } from "./deploymentRepository";
import { ExecutionRepository } from "./executionRepository";
import { EndpointError, success } from "./http";
import { githubConfigurationOf } from "./integrationMappers";
import { IntegrationRepository } from "./integrationRepository";
import { relationID } from "./mappers";
import { requireAcceptedPreviewBinding } from "./previewAcceptanceGuard";
import { ReleaseRepository } from "./releaseRepository";
import { idempotencyKeyFor, readBody, withHandler } from "./request";
import { toSourcePromotionDTO } from "./sourcePromotionMapper";
import { SourcePromotionRepository } from "./sourcePromotionRepository";

const sourceEligibleStates = new Set([
  "awaiting_release_approval",
  "preview_accepted",
  "release_approved",
  "release_failed",
  "release_preparing",
]);

const project = async (input: {
  changeRequestID: string;
  options: SanitizedRealizeAIPluginOptions;
  req: Parameters<PayloadEndpointHandler>[0];
  userID: number | string;
}) => {
  const changeRepository = new ChangeRepository(input.req.payload, input.req);
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
    deploymentRepository: new DeploymentRepository(
      input.req.payload,
      input.req,
    ),
    executionRepository: new ExecutionRepository(input.req.payload, input.req),
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

/** Создаёт endpoint публикации draft PR и detail endpoint его evidence. */
export const createSourcePromotionHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  detail: PayloadEndpointHandler;
  publish: PayloadEndpointHandler;
} => ({
  detail: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    const promotionID = parseIdentifier(
      req.routeParams?.id,
      "source promotion id",
    );
    const repository = new SourcePromotionRepository(req.payload, req);
    const promotion = await repository.getPromotion(promotionID);
    if (!promotion) {
      throw new EndpointError(
        "NOT_FOUND",
        "Source promotion was not found.",
        404,
      );
    }
    const changeRequestID = relationID(promotion.changeRequest);
    if (!changeRequestID) {
      throw new EndpointError(
        "INTERNAL_ERROR",
        "Source promotion has no owning Change Request.",
        500,
      );
    }
    await new ChangeRepository(req.payload, req).getOwnedChange(
      changeRequestID,
      user.id,
    );
    return success(toSourcePromotionDTO(promotion), correlationID);
  }),

  publish: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    if (!options.sourcePromotion.enabled) {
      throw new EndpointError(
        "AI_DISABLED",
        "GitHub Pull Request publication is disabled.",
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
    const input = parsePublishPullRequestInput(await readBody(req));
    const changeRepository = new ChangeRepository(req.payload, req);
    const deploymentRepository = new DeploymentRepository(req.payload, req);
    const repository = new SourcePromotionRepository(req.payload, req);
    const change = await changeRepository.getOwnedChange(
      changeRequestID,
      user.id,
    );
    const previewAcceptance = await changeRepository.getApproval(
      changeRequestID,
      "PREVIEW_ACCEPTANCE",
    );
    const deployment =
      await deploymentRepository.getLatestDeployment(changeRequestID);
    const existing =
      (await repository.getLatestPromotion(changeRequestID)) ||
      (await repository.findByIdempotencyKey(user.id, idempotencyKey));
    if (existing) {
      if (
        existing.gitCommit !== input.expectedGitCommit ||
        existing.sourcePreviewArtifactHash !== input.expectedPreviewArtifactHash
      ) {
        throw new EndpointError(
          "CONFLICT",
          "The existing source promotion belongs to another preview artifact.",
          409,
        );
      }
      if (existing.status !== "failed" && existing.status !== "blocked") {
        return success(
          await project({ changeRequestID, options, req, userID: user.id }),
          correlationID,
        );
      }
    }
    if (
      !previewAcceptance ||
      !deployment ||
      !sourceEligibleStates.has(String(change.state)) ||
      deployment.status !== "accepted" ||
      !deployment.artifactHash ||
      !deployment.commitSHA ||
      !deployment.evidenceHash ||
      !deployment.reviewEvidenceHash
    ) {
      throw new EndpointError(
        "CONFLICT",
        "An exact accepted local preview artifact is required.",
        409,
      );
    }
    if (Number(change.version) !== input.expectedVersion) {
      throw new EndpointError(
        "CONFLICT",
        "The Change Request version has changed. Reload before publication.",
        409,
      );
    }
    if (
      deployment.artifactHash !== input.expectedPreviewArtifactHash ||
      deployment.commitSHA !== input.expectedGitCommit
    ) {
      throw new EndpointError(
        "CONFLICT",
        "The accepted preview no longer matches the requested commit.",
        409,
      );
    }
    if (Date.parse(String(deployment.expiresAt || "")) <= Date.now()) {
      throw new EndpointError(
        "CONFLICT",
        "The accepted preview artifact has expired.",
        409,
      );
    }
    requireAcceptedPreviewBinding({
      acceptance: previewAcceptance,
      changeRequestID,
      deployment,
      expectedVersion: input.expectedVersion,
    });

    const integration = await new IntegrationRepository(
      req.payload,
      req,
    ).getPrimaryGitHub();
    if (
      !integration ||
      integration.enabled !== true ||
      integration.lastTestStatus !== "passed" ||
      typeof integration.credentialEnvelope !== "string"
    ) {
      throw new EndpointError(
        "INTEGRATION_UNAVAILABLE",
        "Connect, enable and test GitHub before publishing a Pull Request.",
        409,
      );
    }
    const configuration = githubConfigurationOf(integration.configuration);
    if (!configuration.defaultBranch) {
      throw new EndpointError(
        "INTEGRATION_UNAVAILABLE",
        "The tested GitHub connection has no default branch.",
        409,
      );
    }
    const integrationRevision = Number(integration.revision);
    if (!Number.isInteger(integrationRevision) || integrationRevision < 1) {
      throw new EndpointError(
        "INTEGRATION_UNAVAILABLE",
        "The GitHub connection revision is invalid.",
        409,
      );
    }

    const promotionKey = createSourcePromotionKey({
      baseBranch: configuration.defaultBranch,
      changeRequestID,
      gitCommit: String(deployment.commitSHA),
      repositorySlug: configuration.repositorySlug,
      sourceAcceptanceHash: String(previewAcceptance.boundHash),
      sourcePreviewArtifactHash: String(deployment.artifactHash),
      sourcePreviewEvidenceHash: String(deployment.evidenceHash),
    });
    const headBranch = createSourcePromotionHeadBranch({
      changeRequestID,
      promotionKey,
    });
    const destination = assessSourcePromotionDestination({
      baseBranch: configuration.defaultBranch,
      gitCommit: String(deployment.commitSHA),
      headBranch,
      repositorySlug: configuration.repositorySlug,
    });
    if (!destination.allowed) {
      throw new EndpointError("CONFLICT", destination.reason, 409);
    }
    if (existing) {
      if (
        existing.promotionKey !== promotionKey ||
        existing.headBranch !== headBranch ||
        String(existing.repositorySlug).toLowerCase() !==
          configuration.repositorySlug.toLowerCase() ||
        existing.baseBranch !== configuration.defaultBranch ||
        existing.sourceAcceptanceHash !== previewAcceptance.boundHash ||
        existing.sourcePreviewEvidenceHash !== deployment.evidenceHash
      ) {
        throw new EndpointError(
          "CONFLICT",
          "The stored source promotion destination no longer matches its accepted preview.",
          409,
        );
      }
      await repository.requeuePromotion({
        integrationRevision,
        promotionID: existing.id,
      });
    } else {
      try {
        await repository.createPromotion({
          baseBranch: configuration.defaultBranch,
          changeRequestID,
          gitCommit: String(deployment.commitSHA),
          headBranch,
          idempotencyKey,
          initiatedBy: user.id,
          integrationRevision,
          previewDeploymentID: String(deployment.id),
          promotionKey,
          repositorySlug: configuration.repositorySlug,
          sourceAcceptanceHash: String(previewAcceptance.boundHash),
          sourcePreviewArtifactHash: String(deployment.artifactHash),
          sourcePreviewEvidenceHash: String(deployment.evidenceHash),
        });
      } catch (error) {
        const concurrent =
          (await repository.getLatestPromotion(changeRequestID)) ||
          (await repository.findByIdempotencyKey(user.id, idempotencyKey));
        if (!concurrent) throw error;
      }
    }
    await changeRepository.updateState(changeRequestID, {
      state: String(change.state),
      version: input.expectedVersion + 1,
    });
    return success(
      await project({ changeRequestID, options, req, userID: user.id }),
      correlationID,
      202,
    );
  }),
});
