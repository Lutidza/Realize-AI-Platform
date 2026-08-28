/**
 * @file services/ai-execution-worker/src/sourcePromotionExecutor.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Оркестрирует exact branch publication и draft Pull Request без merge authority.
 */

import {
  assessSourcePromotionDestination,
  assessSourcePromotionEvidence,
  createSourcePromotionHeadBranch,
  createSourcePromotionEvidenceHash,
  createSourcePromotionKey,
} from "@realize/change-engine";

import type { ExecutionWorkerConfig } from "./config";
import {
  IntegrationRuntimeError,
  type IntegrationWorkerRepository,
} from "./integrationRepository";
import {
  publishExactGitHubBranch,
  SourcePromotionGitPolicyError,
} from "./sourcePromotionGit";
import {
  ensureGitHubDraftPullRequest,
  GitHubPullRequestError,
} from "./sourcePromotionGitHub";
import type { SourcePromotionWorkerRepository } from "./sourcePromotionRepository";
import type { ClaimedSourcePromotion } from "./sourcePromotionTypes";

class SourcePromotionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourcePromotionPolicyError";
  }
}

const safeTitle = (value: string): string =>
  `chore(ai): ${
    value
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "accepted change"
  }`.slice(0, 180);

const safeSummary = (value: string, repositoryRoot: string): string =>
  value
    .replaceAll(repositoryRoot, "[repository]")
    .replace(/\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g, "[redacted-token]")
    .slice(0, 4_000);

/** Выполняет claimed source promotion и сохраняет только проверенный PR result. */
export const executeClaimedSourcePromotion = async (input: {
  config: ExecutionWorkerConfig;
  integrations: IntegrationWorkerRepository;
  job: ClaimedSourcePromotion;
  repository: SourcePromotionWorkerRepository;
}): Promise<void> => {
  try {
    const integration = await input.integrations.resolvePrimaryGitHub();
    if (integration.state !== "ready") {
      throw new IntegrationRuntimeError(
        "An enabled GitHub integration is required for source promotion.",
      );
    }
    if (
      integration.revision !== input.job.integrationRevision ||
      integration.repositorySlug.toLowerCase() !==
        input.job.repositorySlug.toLowerCase() ||
      integration.defaultBranch !== input.job.baseBranch
    ) {
      throw new IntegrationRuntimeError(
        "GitHub integration changed after source promotion was queued.",
      );
    }
    const expectedPromotionKey = createSourcePromotionKey({
      baseBranch: input.job.baseBranch,
      changeRequestID: String(input.job.changeRequestID),
      gitCommit: input.job.gitCommit,
      repositorySlug: input.job.repositorySlug,
      sourceAcceptanceHash: input.job.sourceAcceptanceHash,
      sourcePreviewArtifactHash: input.job.sourcePreviewArtifactHash,
      sourcePreviewEvidenceHash: input.job.sourcePreviewEvidenceHash,
    });
    const expectedHeadBranch = createSourcePromotionHeadBranch({
      changeRequestID: String(input.job.changeRequestID),
      promotionKey: expectedPromotionKey,
    });
    if (
      input.job.promotionKey !== expectedPromotionKey ||
      input.job.headBranch !== expectedHeadBranch
    ) {
      throw new SourcePromotionPolicyError(
        "Stored source promotion identity no longer matches its exact binding.",
      );
    }
    const destination = assessSourcePromotionDestination({
      baseBranch: input.job.baseBranch,
      gitCommit: input.job.gitCommit,
      headBranch: input.job.headBranch,
      repositorySlug: input.job.repositorySlug,
    });
    if (!destination.allowed) {
      throw new SourcePromotionPolicyError(destination.reason);
    }
    const gitCommand = input.config.sourcePromotionGitCommand;
    if (!gitCommand) {
      throw new SourcePromotionPolicyError(
        "Source promotion Git command is not configured.",
      );
    }

    await input.repository.markPublishingRef(input.job);
    await publishExactGitHubBranch({
      gitCommand,
      gitCommit: input.job.gitCommit,
      headBranch: input.job.headBranch,
      repositoryRoot: input.config.repositoryRoot,
      repositorySlug: input.job.repositorySlug,
      timeoutMs: input.config.sourcePromotionTimeoutMs,
      token: integration.token,
    });
    await input.repository.markCreatingPullRequest(input.job);
    const pullRequest = await ensureGitHubDraftPullRequest({
      baseBranch: input.job.baseBranch,
      body: [
        "Automated Realize AI source promotion.",
        "",
        `Change Request: ${input.job.changeRequestID}`,
        `Exact commit: ${input.job.gitCommit}`,
        `Preview artifact: ${input.job.sourcePreviewArtifactHash}`,
        "",
        "This Pull Request is draft. No merge or deployment was performed.",
      ].join("\n"),
      gitCommit: input.job.gitCommit,
      headBranch: input.job.headBranch,
      repositorySlug: input.job.repositorySlug,
      timeoutMs: input.config.sourcePromotionTimeoutMs,
      title: safeTitle(input.job.changeTitle),
      token: integration.token,
    });
    const evidenceHash = createSourcePromotionEvidenceHash({
      baseBranch: input.job.baseBranch,
      draft: pullRequest.draft,
      gitCommit: input.job.gitCommit,
      headBranch: input.job.headBranch,
      promotionKey: input.job.promotionKey,
      pullRequestNumber: pullRequest.number,
      pullRequestState: pullRequest.state,
      pullRequestURL: pullRequest.url,
      repositorySlug: input.job.repositorySlug,
      sourceAcceptanceHash: input.job.sourceAcceptanceHash,
      sourcePreviewArtifactHash: input.job.sourcePreviewArtifactHash,
      sourcePreviewEvidenceHash: input.job.sourcePreviewEvidenceHash,
    });
    const evidence = assessSourcePromotionEvidence({
      baseBranch: input.job.baseBranch,
      draft: pullRequest.draft,
      evidenceHash,
      gitCommit: input.job.gitCommit,
      headBranch: input.job.headBranch,
      promotionKey: input.job.promotionKey,
      pullRequestNumber: pullRequest.number,
      pullRequestState: pullRequest.state,
      pullRequestURL: pullRequest.url,
      repositorySlug: input.job.repositorySlug,
      sourceAcceptanceHash: input.job.sourceAcceptanceHash,
      sourcePreviewArtifactHash: input.job.sourcePreviewArtifactHash,
      sourcePreviewEvidenceHash: input.job.sourcePreviewEvidenceHash,
    });
    if (!evidence.allowed) {
      throw new SourcePromotionPolicyError(evidence.reason);
    }
    await input.repository.complete(input.job, pullRequest, evidenceHash);
  } catch (error) {
    const summary = safeSummary(
      error instanceof Error
        ? error.message
        : "GitHub source promotion failed.",
      input.config.repositoryRoot,
    );
    await input.repository.fail(input.job, {
      blocked:
        error instanceof SourcePromotionPolicyError ||
        error instanceof SourcePromotionGitPolicyError ||
        error instanceof IntegrationRuntimeError ||
        (error instanceof GitHubPullRequestError && error.blocked),
      summary,
    });
  }
};
