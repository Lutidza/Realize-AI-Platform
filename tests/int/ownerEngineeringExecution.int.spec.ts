/**
 * @file tests/int/ownerEngineeringExecution.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-23
 * @description Проверяет lifecycle owner-run, отмену admission и выдачу успеха только после cleanup и durable receipt.
 */

// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@realize/ai-contracts";
import type { OwnerEngineeringRunDependencies } from "../../services/ai-control-plane/src/owner-engineering/OwnerEngineeringRuntime.types";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  acquire: vi.fn(),
  finish: vi.fn(),
  dispose: vi.fn(),
  materialize: vi.fn(),
  build: vi.fn(),
  mkdir: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  cancel: vi.fn(),
  meter: vi.fn(),
  onEvent: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ mkdtemp: mocks.mkdir, rm: mocks.remove }));
vi.mock("@realize/codex-adapter", () => ({
  OpenAICodexAdapter: class {
    constructor(options: unknown) {
      mocks.create(options);
    }
    cancelRun = mocks.cancel;
  },
}));
vi.mock(
  "../../services/ai-control-plane/src/owner-engineering/verifyOwnerEngineeringGrant.validator",
  () => ({ verifyOwnerEngineeringGrant: mocks.verify }),
);
vi.mock(
  "../../services/ai-control-plane/src/owner-engineering/OwnerEngineeringRun.repository",
  () => ({
    OwnerEngineeringRunRepository: class {
      acquire = async () => ({ finish: mocks.finish });
    },
  }),
);
vi.mock(
  "../../services/ai-control-plane/src/materializeChatAttachments.service",
  () => ({ materializeChatAttachments: mocks.materialize }),
);
vi.mock(
  "../../services/ai-control-plane/src/owner-engineering/buildOwnerEngineeringTurn.service",
  () => ({ buildOwnerEngineeringTurn: mocks.build }),
);

import { executeOwnerEngineeringRun } from "../../services/ai-control-plane/src/owner-engineering/executeOwnerEngineeringRun.service";

let dependencies: OwnerEngineeringRunDependencies;
let lease: {
  environment: NodeJS.ProcessEnv;
  signal: AbortSignal;
  search: { enabled: false; mode: "direct" };
  dispose: typeof mocks.dispose;
  model: string;
  authMode: string;
};
const complete: AgentEvent = {
  type: "assistant.completed",
  content: "Готово.",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockImplementation(() => ({
    actorID: "owner",
    expiresAt: Date.now() + 60_000,
  }));
  mocks.finish.mockResolvedValue(undefined);
  mocks.dispose.mockResolvedValue(undefined);
  mocks.mkdir.mockResolvedValue("/private/owner/attachments-fixture");
  mocks.remove.mockResolvedValue(undefined);
  mocks.materialize.mockResolvedValue({ images: [], instructions: "" });
  mocks.build.mockReturnValue({
    developerInstructions: "fixture",
    prompt: "fixture",
  });
  mocks.cancel.mockResolvedValue(undefined);
  mocks.meter.mockReturnValue({
    async *runTurn() {
      yield complete;
    },
  });
  lease = {
    environment: { NODE_ENV: "test", CODEX_HOME: "/private/integration" },
    signal: new AbortController().signal,
    search: { enabled: false, mode: "direct" },
    dispose: mocks.dispose,
    model: "fixture-model",
    authMode: "chatgpt",
  };
  mocks.acquire.mockResolvedValue(lease);
  dependencies = {
    configuration: {
      enabled: true,
      mode: "owner-host",
      hostname: "fixture-host",
      osUser: "owner",
      workspaceRoot: "/workspace",
      stateRoot: "/private/owner",
      ownerIDs: ["owner"],
    },
    token: "fixture-signed-admission",
    run: {
      id: "run",
      prompt: "fixture",
      cancelRequested: false,
      status: "queued",
    },
    runtime: {
      codex: { acquire: mocks.acquire },
      usage: { meter: mocks.meter },
    },
    assets: {},
    registerAdapter: vi.fn(),
    onEvent: mocks.onEvent,
  } as unknown as OwnerEngineeringRunDependencies;
});
afterEach(() => vi.useRealTimers());

describe("owner engineering execution lifecycle", () => {
  it("публикует успех после dispose, удаления вложений и durable finish", async () => {
    const sequence: string[] = [];
    mocks.dispose.mockImplementation(async () => {
      sequence.push("dispose");
    });
    mocks.remove.mockImplementation(async () => {
      sequence.push("attachments");
    });
    mocks.finish.mockImplementation(async () => {
      sequence.push("receipt");
    });
    mocks.onEvent.mockImplementation(() => {
      sequence.push("completion");
    });
    await executeOwnerEngineeringRun(dependencies);
    expect(sequence).toEqual([
      "dispose",
      "attachments",
      "receipt",
      "completion",
    ]);
    expect(mocks.finish).toHaveBeenCalledWith("completed");
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerHost: {
          workspaceRoot: "/workspace",
          osUser: "owner",
          attachmentRoot: "/private/owner/attachments-fixture",
          trustedProjectMcp: true,
        },
      }),
    );
  });

  it("отмена во время acquire освобождает lease до материализации и модели", async () => {
    let acquired!: (value: typeof lease) => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    mocks.acquire.mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        acquired = resolve;
      });
    });
    const executing = executeOwnerEngineeringRun(dependencies);
    await startedPromise;
    dependencies.run.cancelRequested = true;
    acquired(lease);
    await executing;
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.materialize).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.meter).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith("cancelled");
  });

  it("истёкший во время acquire grant не запускает turn и освобождает lease", async () => {
    mocks.verify
      .mockReturnValueOnce({ actorID: "owner", expiresAt: Date.now() + 1000 })
      .mockImplementationOnce(() => {
        throw Error("owner_engineering_admission_denied");
      });
    await expect(executeOwnerEngineeringRun(dependencies)).rejects.toThrow(
      "owner_engineering_admission_denied",
    );
    expect(mocks.meter).not.toHaveBeenCalled();
    expect(mocks.materialize).not.toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.finish).toHaveBeenCalledWith("failed");
  });

  it("ошибка dispose не оставляет private attachments и не публикует успех", async () => {
    mocks.dispose.mockRejectedValue(Error("fixture-dispose-failure"));
    await expect(executeOwnerEngineeringRun(dependencies)).rejects.toThrow(
      "fixture-dispose-failure",
    );
    expect(mocks.remove).toHaveBeenCalledWith(
      "/private/owner/attachments-fixture",
      { recursive: true, force: true },
    );
    expect(mocks.onEvent).not.toHaveBeenCalledWith(complete);
    expect(mocks.finish).toHaveBeenCalledWith("failed");
  });

  it("ошибка durable finish после ответа не публикует успех", async () => {
    mocks.finish.mockRejectedValue(Error("fixture-journal-failure"));
    await expect(executeOwnerEngineeringRun(dependencies)).rejects.toThrow(
      "fixture-journal-failure",
    );
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.onEvent).not.toHaveBeenCalledWith(complete);
  });

  it("ошибка iterator cleanup после assistant.completed остаётся неуспехом", async () => {
    mocks.meter.mockReturnValue({
      async *runTurn() {
        yield complete;
        throw Error("fixture-process-close-failure");
      },
    });
    await expect(executeOwnerEngineeringRun(dependencies)).rejects.toThrow(
      "fixture-process-close-failure",
    );
    expect(mocks.finish).toHaveBeenCalledWith("failed");
    expect(mocks.onEvent).not.toHaveBeenCalledWith(complete);
  });

  it("TTL останавливает активный adapter через его signal и завершает receipt cancelled", async () => {
    vi.useFakeTimers();
    mocks.verify.mockImplementation(() => ({
      actorID: "owner",
      expiresAt: Date.now() + 100,
    }));
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    mocks.meter.mockReturnValue({
      async *runTurn() {
        const signal: AbortSignal = mocks.create.mock.calls[0][0].signal;
        started();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        yield { type: "run.cancelled" };
      },
    });
    const executing = executeOwnerEngineeringRun(dependencies);
    await startedPromise;
    await vi.advanceTimersByTimeAsync(100);
    await executing;
    expect(mocks.onEvent).toHaveBeenCalledWith({ type: "run.cancelled" });
    expect(mocks.finish).toHaveBeenCalledWith("cancelled");
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });
});
