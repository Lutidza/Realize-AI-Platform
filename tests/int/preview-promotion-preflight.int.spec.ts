/**
 * @file tests/int/preview-promotion-preflight.int.spec.ts
 * @version 1.1.1
 * @date 2026-10-22
 * @description Проверяет раннюю остановку promotion и сохранение evidence недоступного Chromium.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preflight: vi.fn(),
  prepare: vi.fn(),
  check: vi.fn(),
  review: vi.fn(),
  commit: vi.fn(),
  start: vi.fn(),
  smoke: vi.fn(),
  remove: vi.fn(),
}));
vi.mock(
  "../../services/ai-execution-worker/src/previewBrowserPreflight.service",
  () => ({ runPreviewBrowserPreflight: mocks.preflight }),
);
vi.mock("../../services/ai-execution-worker/src/promotionWorktree", () => ({
  preparePromotionWorktree: mocks.prepare,
}));
vi.mock(
  "../../services/ai-execution-worker/src/commitPromotion.service",
  () => ({
    commitPromotion: mocks.commit,
  }),
);
vi.mock(
  "../../services/ai-execution-worker/src/removePromotionWorktree.service",
  () => ({
    removePromotionWorktree: mocks.remove,
  }),
);
vi.mock("../../services/ai-execution-worker/src/checkRunner", () => ({
  runExecutionCheck: mocks.check,
}));
vi.mock("../../services/ai-execution-worker/src/independentReviewer", () => ({
  IndependentReviewError: class extends Error {},
  runIndependentReview: mocks.review,
}));
vi.mock("../../services/ai-execution-worker/src/previewRuntime", () => ({
  startLocalPreview: mocks.start,
  stopLocalPreviewProcess: vi.fn(),
  removePreviewRuntimeFiles: vi.fn(),
}));
vi.mock("../../services/ai-execution-worker/src/previewBrowserSmoke", () => ({
  runPreviewBrowserSmoke: mocks.smoke,
}));
vi.mock("../../services/ai-execution-worker/src/previewDatabase", () => ({
  dropPreviewDatabase: vi.fn(),
}));
vi.mock("../../services/ai-execution-worker/src/workspaceDependencies", () => ({
  withWorkspaceDependencies: async (
    _root: string,
    _workspace: string,
    operation: () => Promise<void>,
  ) => await operation(),
}));

import { executeClaimedPromotion } from "../../services/ai-execution-worker/src/promotionExecutor";
import type { WorkerCheckResult } from "../../services/ai-execution-worker/src/types";
import type { UsageRuntime } from "@realize/payload-ai-control/server/usage";

// Этот тест проверяет preview orchestration; финансовый admission имеет отдельные native tests.
const usage: Pick<UsageRuntime, "meter" | "measureOperation"> = {
  meter: (adapter) => adapter,
  measureOperation: (_source, operation) => operation(),
};

const checkResult = (
  command: string,
  status: WorkerCheckResult["status"] = "passed",
): WorkerCheckResult => ({
  command,
  status,
  startedAt: "2026-09-17T00:00:00Z",
  finishedAt: "2026-09-17T00:00:01Z",
  durationMs: 1_000,
  evidenceHash: "e".repeat(64),
  outputSummary: status === "failed" ? "Executable does not exist" : "passed",
});
const repository = {
  addCheckResult: vi.fn(),
  fail: vi.fn(),
  complete: vi.fn(),
  markRunningChecks: vi.fn(),
  markReviewing: vi.fn(),
  recordReview: vi.fn(),
  markCommitting: vi.fn(),
  markStartingPreview: vi.fn(),
};
const referencePage = "src/app/(reference)/reference/realize-ai/page.tsx";
const input = () =>
  ({
    config: {
      repositoryRoot: "/repository",
      promotionWorkspaceRoot: "/workspaces",
    },
    codex: {},
    usage,
    repository,
    job: {
      allowedPaths: [referencePage],
      expectedPaths: [referencePage],
      requiredChecks: ["npm run build"],
    },
  }) as unknown as Parameters<typeof executeClaimedPromotion>[0];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.preflight.mockResolvedValue(
    checkResult("playwright preview preflight"),
  );
  mocks.prepare.mockResolvedValue("/workspaces/preview-worktree");
  mocks.check.mockResolvedValue(checkResult("npm run build"));
  mocks.review.mockResolvedValue({
    status: "approved",
    evidenceHash: "r".repeat(64),
  });
  mocks.commit.mockResolvedValue({ artifactHash: "a".repeat(64) });
  mocks.start.mockResolvedValue({
    previewURL: "http://127.0.0.1:3200/reference/realize-ai",
  });
  mocks.smoke.mockResolvedValue(checkResult("playwright preview smoke"));
});

describe("promotion Chromium preflight", () => {
  it("persists failed preflight before creating a worktree or spending on checks and review", async () => {
    const failure = checkResult("playwright preview preflight", "failed");
    mocks.preflight.mockResolvedValue(failure);
    const request = input();
    await executeClaimedPromotion(request);
    expect(repository.addCheckResult).toHaveBeenCalledWith(
      request.job,
      failure,
      1,
      "preview_validation",
    );
    expect(repository.fail).toHaveBeenCalledWith(
      request.job,
      expect.objectContaining({
        blocked: false,
        summary: "Preview Chromium preflight failed: Executable does not exist",
      }),
    );
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.review).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("retains preflight evidence and forwards the approved reference target to runtime", async () => {
    const request = input();
    await executeClaimedPromotion(request);
    expect(mocks.preflight.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prepare.mock.invocationCallOrder[0],
    );
    expect(
      repository.addCheckResult.mock.calls.map(
        ([, result, sequence, stage]) => [result.command, sequence, stage],
      ),
    ).toEqual([
      ["playwright preview preflight", 1, "preview_validation"],
      ["npm run build", 2, "preview_validation"],
      ["playwright preview smoke", 3, "preview_smoke"],
    ]);
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({ targetPath: "/reference/realize-ai" }),
    );
    expect(mocks.smoke).toHaveBeenCalledWith(
      "http://127.0.0.1:3200/reference/realize-ai",
    );
    expect(repository.complete).toHaveBeenCalledOnce();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("rejects an ambiguous reference target before preparing runtime infrastructure", async () => {
    const request = input();
    request.job.expectedPaths = [];
    await executeClaimedPromotion(request);
    expect(repository.fail).toHaveBeenCalledWith(
      request.job,
      expect.objectContaining({
        blocked: true,
        summary: expect.stringContaining("exactly one changed static page.tsx"),
      }),
    );
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
