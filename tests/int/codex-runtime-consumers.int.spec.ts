/**
 * @file tests/int/codex-runtime-consumers.int.spec.ts
 * @version 1.1.1
 * @date 2026-09-15
 * @description Проверяет интеграцию, сохранение пояснений при отказе и границы отдельного этапа исполнения.
 */

// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionWorkerConfig } from "../../services/ai-execution-worker/src/config";
import type { ClaimedPreviewDeployment } from "../../services/ai-execution-worker/src/previewTypes";
import { runIndependentReview } from "../../services/ai-execution-worker/src/independentReviewer";
import { executeClaimedJob } from "../../services/ai-execution-worker/src/executor";
import type { ClaimedExecutionJob } from "../../services/ai-execution-worker/src/types";
import type { ExecutionJobRepository } from "../../services/ai-execution-worker/src/jobRepository";
import { WorktreePolicyError } from "../../services/ai-execution-worker/src/worktree";

const mock = vi.hoisted(() => ({
  create: vi.fn(),
  turn: vi.fn(),
  capture: vi.fn(),
  check: vi.fn(),
  verify: vi.fn(),
}));
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
  verifyExecutionCapability: () => mock.verify(),
}));
vi.mock(
  "../../services/ai-execution-worker/src/worktree",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createExecutionWorktree: async () => "/fixture-workspace",
    captureWorktreeDiff: (...args: unknown[]) => mock.capture(...args),
  }),
);
vi.mock("../../services/ai-execution-worker/src/checkRunner", () => ({
  runExecutionCheck: (...args: unknown[]) => mock.check(...args),
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
  mock.verify.mockReturnValue(true);
  mock.capture.mockResolvedValue({ diffHash: "fixture-diff" });
});

describe("Codex reviewer integration consumer", () => {
  it("передаёт профиль интеграции и signal reviewer с историей только на время private lease", async () => {
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
        ephemeral: false,
        sandboxProfile: "review-readonly",
        model: "fixture-integration-review-model",
      }),
    );
    expect(test.input.codex.acquire).toHaveBeenCalledExactlyOnceWith({
      isolated: true,
    });
    const instructions = mock.turn.mock.calls[0]?.[0].developerInstructions;
    expect(instructions).toContain(
      "separate native repository-search sub-agent",
    );
    expect(instructions).toContain("produce your own verdict");
    expect(instructions).toContain(
      "return changes_requested with a blocking finding",
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
      addCheckResult: vi.fn(),
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
        ephemeral: false,
        model: "fixture-integration-model",
      }),
    );
    expect(test.input.codex.acquire).toHaveBeenCalledExactlyOnceWith({
      isolated: true,
    });
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
      expect.objectContaining({
        summary: "fixture persistence failure",
        workerSummary: "fixture implemented",
      }),
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
    expect(
      test.repository.fail.mock.calls[0]?.[1]?.workerSummary,
    ).toBeUndefined();
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

  it("сохраняет actual пояснение при пустом diff, не запуская проверки и не принимая результат", async () => {
    const test = execution();
    const fixtureToken = ["sk", "proj", "synthetic".repeat(8)].join("-");
    mock.turn.mockImplementation(async function* () {
      yield {
        type: "assistant.completed",
        content: `Не хватает исходных данных в /fixture-workspace/src/fixture.ts. ${fixtureToken}`,
      };
    });
    mock.capture.mockRejectedValue(
      new WorktreePolicyError("fixture empty diff refusal"),
    );
    test.executionInput.job.checks = ["npm run typecheck"];
    await executeClaimedJob(test.executionInput);
    expect(test.repository.fail).toHaveBeenCalledExactlyOnceWith(
      test.executionInput.job,
      {
        blocked: true,
        summary: "fixture empty diff refusal",
        workerSummary:
          "Не хватает исходных данных в [workspace]/src/fixture.ts. [redacted-token]",
        validationFailure: false,
      },
    );
    expect(test.repository.markValidating).not.toHaveBeenCalled();
    expect(mock.check).not.toHaveBeenCalled();
    expect(test.repository.complete).not.toHaveBeenCalled();
    expect(test.lease.dispose).toHaveBeenCalledTimes(1);
  });

  it("не подставляет выдуманный итог при завершении без сообщения модели", async () => {
    const test = execution();
    mock.turn.mockImplementation(async function* () {
      yield { type: "run.completed" };
    });
    mock.capture.mockRejectedValue(
      new WorktreePolicyError("fixture empty diff refusal"),
    );
    await executeClaimedJob(test.executionInput);
    expect(test.repository.fail).toHaveBeenCalledWith(
      test.executionInput.job,
      expect.objectContaining({
        blocked: true,
        workerSummary: undefined,
        validationFailure: false,
      }),
    );
    expect(test.repository.complete).not.toHaveBeenCalled();
  });

  it("сохраняет пояснение и failed check evidence, прерывая дальнейшие проверки", async () => {
    const test = execution();
    const check = {
      command: "npm run typecheck",
      status: "failed",
      evidenceHash: "raw-check-hash",
    };
    test.executionInput.job.checks = [check.command, "npm run build"];
    mock.turn.mockImplementation(async function* () {
      yield {
        type: "assistant.completed",
        content: "Изменён src/fixture.ts; результат требует проверки.",
      };
    });
    mock.check.mockResolvedValue(check);
    await executeClaimedJob(test.executionInput);
    expect(test.repository.markValidating).toHaveBeenCalledTimes(1);
    expect(mock.check).toHaveBeenCalledTimes(1);
    expect(test.repository.addCheckResult).toHaveBeenCalledWith(
      test.executionInput.job,
      check,
      1,
    );
    expect(test.repository.fail).toHaveBeenCalledWith(test.executionInput.job, {
      blocked: false,
      summary: "Required check failed: npm run typecheck",
      workerSummary: "Изменён src/fixture.ts; результат требует проверки.",
      validationFailure: true,
    });
    expect(test.repository.complete).not.toHaveBeenCalled();
  });

  it("не выдаёт разрешения на исполнение при отказе проверки capability", async () => {
    const test = execution();
    mock.verify.mockReturnValue(false);
    await executeClaimedJob(test.executionInput);
    expect(test.input.codex.acquire).not.toHaveBeenCalled();
    expect(mock.turn).not.toHaveBeenCalled();
    expect(mock.capture).not.toHaveBeenCalled();
    expect(mock.check).not.toHaveBeenCalled();
    expect(test.repository.fail).toHaveBeenCalledWith(
      test.executionInput.job,
      expect.objectContaining({
        blocked: true,
        workerSummary: undefined,
        validationFailure: false,
      }),
    );
  });

  it("разделяет роли предыдущего планирования и исполнения, сохраняя утверждённый текст и scope", async () => {
    const test = execution();
    const plan =
      "Файлы не изменены: текущая сессия допускает чтение и подготовку плана. Изменить src/fixture.ts. Оформить план.";
    test.executionInput.job.plan = plan;
    test.executionInput.job.originalRequest = "приступай";
    mock.turn.mockImplementation(async function* () {
      yield { type: "assistant.completed", content: "fixture implemented" };
    });
    await executeClaimedJob(test.executionInput);
    const input = mock.turn.mock.calls[0]?.[0];
    expect(input.prompt).toBe(
      `приступай\n\nApproved implementation plan:\n${plan}`,
    );
    expect(input.sandboxProfile).toBe("code-workspace-write");
    expect(input.developerInstructions).toContain(
      "separate from the earlier planning chat",
    );
    expect(input.developerInstructions).toContain(
      "actual runtime restrictions",
    );
    expect(input.developerInstructions).toContain(
      JSON.stringify(test.executionInput.job.allowedPaths),
    );
    expect(input.developerInstructions).toContain(
      "Never edit a path outside the writable scope",
    );
    expect(input.developerInstructions).toContain(
      "Do not install packages, change dependencies, commit, push",
    );
    expect(input.developerInstructions).toContain(
      "separate native repository-search sub-agent",
    );
    expect(input.developerInstructions).toContain(
      "For this isolated Code Lane turn only",
    );
    expect(input.developerInstructions).toContain(
      "do not delegate writes, checks or the verdict",
    );
    expect(test.executionInput.job.plan).toBe(plan);
  });
});
