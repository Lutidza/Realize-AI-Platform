/**
 * @file tests/int/codex-runtime-consumers.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Проверяет выбранную интеграцию исполнителя и reviewer Codex, включая cleanup при отказе.
 */

// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionWorkerConfig } from "../../services/ai-execution-worker/src/config";
import type { ClaimedPreviewDeployment } from "../../services/ai-execution-worker/src/previewTypes";
import { runIndependentReview } from "../../services/ai-execution-worker/src/independentReviewer";
import { executeClaimedJob } from "../../services/ai-execution-worker/src/executor";
import type { ClaimedExecutionJob } from "../../services/ai-execution-worker/src/types";
import type { ExecutionJobRepository } from "../../services/ai-execution-worker/src/jobRepository";

const mock = vi.hoisted(() => ({ create: vi.fn(), turn: vi.fn() }));
vi.mock("@realize/codex-adapter", () => ({
  OpenAICodexAdapter: class {
    constructor(options: unknown) {
      mock.create(options);
    }
    runTurn(input: unknown) {
      return mock.turn(input);
    }
    async cancelRun() {}
  },
}));

vi.mock("@realize/change-engine", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyExecutionCapability: () => true,
}));
vi.mock("../../services/ai-execution-worker/src/worktree", () => ({
  WorktreePolicyError: class extends Error {},
  createExecutionWorktree: async () => "/fixture-workspace",
  captureWorktreeDiff: async () => ({ diffHash: "fixture-diff" }),
}));
vi.mock("../../services/ai-execution-worker/src/workspaceDependencies", () => ({
  withWorkspaceDependencies: async (
    _root: string,
    _workspace: string,
    operation: () => Promise<void>,
  ) => operation(),
}));

const fixture = () => {
  const lease = {
    home: "/fixture-selected-profile",
    authMode: "chatgpt" as const,
    revision: 3,
    model: "fixture-integration-model",
    reviewModel: "fixture-integration-review-model",
    environment: {
      NODE_ENV: "test" as const,
      CODEX_HOME: "/fixture-selected-profile",
    },
    signal: new AbortController().signal,
    dispose: vi.fn(async () => undefined),
  };
  return {
    lease,
    input: {
      config: {
        codexBinary: "/fixture-codex-cli",
        reviewTimeoutMs: 30_000,
      } as ExecutionWorkerConfig,
      job: {
        changeRequestID: 1,
        baseCommit: "fixture-base",
        sourceDiffHash: "fixture-diff",
        allowedPaths: ["src/fixture.ts"],
        originalRequest: "fixture request",
        plan: "fixture plan",
      } as ClaimedPreviewDeployment,
      workspace: "/fixture-workspace",
      codex: { acquire: vi.fn(async () => lease) },
    },
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Codex reviewer integration consumer", () => {
  it("передаёт выбранный профиль и connection signal независимому ephemeral reviewer", async () => {
    const test = fixture();
    mock.turn.mockImplementation(async function* () {
      yield {
        type: "assistant.completed",
        content: JSON.stringify({
          status: "approved",
          summary: "fixture accepted",
          findings: [],
        }),
      };
    });
    const result = await runIndependentReview(test.input);
    expect(result.status).toBe("approved");
    expect(result.model).toBe("fixture-integration-review-model");
    expect(mock.create).toHaveBeenCalledWith({
      codexBinary: "/fixture-codex-cli",
      environment: test.lease.environment,
      signal: test.lease.signal,
    });
    expect(mock.turn).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
        sandboxProfile: "review-readonly",
        model: "fixture-integration-review-model",
      }),
    );
    expect(test.lease.dispose).toHaveBeenCalledTimes(1);
  });

  it("освобождает выбранную интеграцию при ошибке Codex", async () => {
    const test = fixture();
    mock.turn.mockImplementation(async function* () {
      yield { type: "run.failed", message: "fixture review failure" };
    });
    await expect(runIndependentReview(test.input)).rejects.toThrow(
      "fixture review failure",
    );
    expect(test.lease.dispose).toHaveBeenCalledTimes(1);
  });

  it("не запускает CLI без разрешённой интеграции", async () => {
    const test = fixture();
    test.input.codex.acquire.mockRejectedValue(
      new Error("fixture integration disabled"),
    );
    await expect(runIndependentReview(test.input)).rejects.toThrow(
      "fixture integration disabled",
    );
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.turn).not.toHaveBeenCalled();
  });
});

describe("Codex implementation integration consumer", () => {
  const execution = () => {
    const test = fixture();
    const repository = {
      markRunning: vi.fn(),
      markValidating: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    return {
      ...test,
      repository,
      executionInput: {
        config: {
          ...test.input.config,
          turnTimeoutMs: 30_000,
          repositoryRoot: "/fixture-root",
        },
        codex: test.input.codex,
        repository: repository as unknown as ExecutionJobRepository,
        job: {
          executionKey: "fixture-run",
          changeRequestID: 1,
          allowedPaths: ["src/fixture.ts"],
          checks: [],
          plan: "fixture plan",
          originalRequest: "fixture request",
          baseCommit: "fixture-base",
        } as unknown as ClaimedExecutionJob,
      },
    };
  };

  it("исполняет job с выбранным auth и сохраняет результат после освобождения lease", async () => {
    const test = execution();
    mock.turn.mockImplementation(async function* () {
      yield { type: "assistant.completed", content: "fixture implemented" };
    });
    await executeClaimedJob(test.executionInput);
    expect(mock.create).toHaveBeenCalledWith({
      codexBinary: "/fixture-codex-cli",
      environment: test.lease.environment,
      signal: test.lease.signal,
    });
    expect(mock.turn).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxProfile: "code-workspace-write",
        ephemeral: true,
        model: "fixture-integration-model",
      }),
    );
    expect(test.repository.complete).toHaveBeenCalledTimes(1);
    expect(test.repository.fail).not.toHaveBeenCalled();
    expect(test.lease.dispose.mock.invocationCallOrder[0]).toBeLessThan(
      test.repository.complete.mock.invocationCallOrder[0],
    );
  });

  it("не принимает результат при ошибке сохранения refreshed credential", async () => {
    const test = execution();
    mock.turn.mockImplementation(async function* () {
      yield { type: "assistant.completed", content: "fixture implemented" };
    });
    test.lease.dispose.mockRejectedValue(
      new Error("fixture persistence failure"),
    );
    await executeClaimedJob(test.executionInput);
    expect(test.repository.complete).not.toHaveBeenCalled();
    expect(test.repository.fail).toHaveBeenCalledWith(
      test.executionInput.job,
      expect.objectContaining({ summary: "fixture persistence failure" }),
    );
  });

  it("сохраняет отказ интеграции без запуска модели", async () => {
    const test = execution();
    test.input.codex.acquire.mockRejectedValue(
      new Error("fixture integration disabled"),
    );
    await executeClaimedJob(test.executionInput);
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.turn).not.toHaveBeenCalled();
    expect(test.repository.complete).not.toHaveBeenCalled();
    expect(test.repository.fail).toHaveBeenCalledWith(
      test.executionInput.job,
      expect.objectContaining({ summary: "fixture integration disabled" }),
    );
  });

  it("передаёт default провайдера без подстановки модели из старого окружения", async () => {
    const test = execution();
    Reflect.deleteProperty(test.lease, "model");
    mock.turn.mockImplementation(async function* () {
      yield { type: "assistant.completed", content: "fixture implemented" };
    });
    await executeClaimedJob(test.executionInput);
    expect(mock.turn).toHaveBeenCalledWith(
      expect.objectContaining({ model: undefined }),
    );
    expect(test.repository.complete).toHaveBeenCalledTimes(1);
  });
});
