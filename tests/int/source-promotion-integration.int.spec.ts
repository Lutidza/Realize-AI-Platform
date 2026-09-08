// @vitest-environment node

/**
 * @file tests/int/source-promotion-integration.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Проверка отказов интеграции перед публикацией с подменой Git и GitHub REST.
 */
import {
  createSourcePromotionHeadBranch,
  createSourcePromotionKey,
} from "@realize/change-engine";
import type {
  GitHubConnectionResolver,
  RuntimeGitHubIntegration,
} from "@realize/payload-ai-control/server/integration-runtime";
import { describe, expect, it, vi } from "vitest";

import type { ExecutionWorkerConfig } from "../../services/ai-execution-worker/src/config";
import { executeClaimedSourcePromotion } from "../../services/ai-execution-worker/src/sourcePromotionExecutor";
import * as sourceGit from "../../services/ai-execution-worker/src/sourcePromotionGit";
import * as sourceGitHub from "../../services/ai-execution-worker/src/sourcePromotionGitHub";
import type { SourcePromotionWorkerRepository } from "../../services/ai-execution-worker/src/sourcePromotionRepository";
import type { ClaimedSourcePromotion } from "../../services/ai-execution-worker/src/sourcePromotionTypes";

const config: ExecutionWorkerConfig = {
  databaseURL: "postgres://unused",
  pollIntervalMs: 1_000,
  previewEnabled: false,
  previewHost: "127.0.0.1",
  previewPortMax: 3_299,
  previewPortMin: 3_200,
  previewRoot: "/fixture/unused-preview",
  previewStartupTimeoutMs: 120_000,
  promotionWorkspaceRoot: "/fixture/unused-promotion",
  releaseEnabled: false,
  releaseOrchestratorArgs: [],
  releaseOrchestratorEnvironment: { NODE_ENV: "test" },
  releaseTimeoutMs: 60_000,
  repositoryRoot: "/fixture/unused-repository",
  reviewTimeoutMs: 60_000,
  signingSecret: "x".repeat(32),
  sourcePromotionEnabled: true,
  sourcePromotionGitCommand: "/fixture/unused-git",
  sourcePromotionTimeoutMs: 120_000,
  turnTimeoutMs: 60_000,
  workerID: "test-worker",
  workspaceRoot: "/fixture/unused-workspace",
};

const accepted = {
  baseBranch: "main",
  gitCommit: "a".repeat(40),
  repositorySlug: "realize/store",
  sourceAcceptanceHash: "b".repeat(64),
  sourcePreviewArtifactHash: "c".repeat(64),
  sourcePreviewEvidenceHash: "d".repeat(64),
};
const promotionKey = createSourcePromotionKey({
  ...accepted,
  changeRequestID: "42",
});
const job: ClaimedSourcePromotion = {
  ...accepted,
  changeRequestID: 42,
  changeTitle: "Accepted fixture change",
  headBranch: createSourcePromotionHeadBranch({
    changeRequestID: "42",
    promotionKey,
  }),
  id: 7,
  integrationRevision: 3,
  promotionKey,
};

const cases: {
  label: string;
  integration: RuntimeGitHubIntegration;
  summary: string;
}[] = [
  {
    label: "absent",
    integration: { state: "absent" },
    summary: "An enabled GitHub integration is required for source promotion.",
  },
  {
    label: "disabled",
    integration: { state: "disabled" },
    summary: "An enabled GitHub integration is required for source promotion.",
  },
  {
    label: "изменённую revision",
    integration: {
      defaultBranch: "main",
      repositorySlug: "realize/store",
      revision: 4,
      state: "ready",
      token: "source-promotion-synthetic-fixture-token",
    },
    summary: "GitHub integration changed after source promotion was queued.",
  },
];

describe("граница интеграции source promotion", () => {
  it.each(cases)(
    "блокирует $label до вызова Git или REST",
    async ({ integration, summary }) => {
      const publish = vi
        .spyOn(sourceGit, "publishExactGitHubBranch")
        .mockRejectedValue(
          new Error("Blocked integration must not publish Git refs."),
        );
      const pullRequest = vi
        .spyOn(sourceGitHub, "ensureGitHubDraftPullRequest")
        .mockRejectedValue(
          new Error("Blocked integration must not call GitHub REST."),
        );
      const integrations: GitHubConnectionResolver = {
        resolvePrimaryGitHub: vi.fn().mockResolvedValue(integration),
      };
      const repository = {
        complete: vi
          .fn<SourcePromotionWorkerRepository["complete"]>()
          .mockResolvedValue(undefined),
        fail: vi
          .fn<SourcePromotionWorkerRepository["fail"]>()
          .mockResolvedValue(undefined),
        markCreatingPullRequest: vi
          .fn<SourcePromotionWorkerRepository["markCreatingPullRequest"]>()
          .mockResolvedValue(undefined),
        markPublishingRef: vi
          .fn<SourcePromotionWorkerRepository["markPublishingRef"]>()
          .mockResolvedValue(undefined),
      };
      try {
        await executeClaimedSourcePromotion({
          config,
          integrations,
          job,
          repository: repository as unknown as SourcePromotionWorkerRepository,
        });
        expect(repository.fail).toHaveBeenCalledWith(job, {
          blocked: true,
          summary,
        });
        expect(publish).not.toHaveBeenCalled();
        expect(pullRequest).not.toHaveBeenCalled();
        expect(repository.markPublishingRef).not.toHaveBeenCalled();
        expect(repository.markCreatingPullRequest).not.toHaveBeenCalled();
        expect(repository.complete).not.toHaveBeenCalled();
      } finally {
        publish.mockRestore();
        pullRequest.mockRestore();
      }
    },
  );
});
