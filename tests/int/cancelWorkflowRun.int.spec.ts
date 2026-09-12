// @vitest-environment node
/**
 * @file tests/int/cancelWorkflowRun.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет durable отмену процесса независимо от доступности control plane.
 */
import type { AIStreamEvent } from "@realize/ai-contracts";
import {
  compileAgentConfiguration,
  initializeWorkflow,
  startWorkflowAgentTurn,
  SYSTEM_AI_CONFIG_PROJECTION,
} from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAIConfigReleaseFixture } from "./fixtures/aiConfiguration";
import { cancelWorkflowRun } from "../../packages/payload-ai-plugin/src/chat-context/cancelWorkflowRun.service";
import {
  AIRepository,
  type AIDocument,
} from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { lockAITransaction } from "../../packages/payload-ai-plugin/src/endpoints/lockAITransaction.util";
import { getControlPlaneClient } from "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";

vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/payloadTransaction",
  () => ({
    withPayloadTransaction: async (
      _req: unknown,
      work: () => Promise<unknown>,
    ) => await work(),
  }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/lockAITransaction.util",
  () => ({ lockAITransaction: vi.fn() }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient",
  () => ({ getControlPlaneClient: vi.fn() }),
);

afterEach(() => vi.restoreAllMocks());

const fixture = (status = "queued") => {
  const configuration = {
    schemaVersion: "1.0" as const,
    pointerVersion: 1,
    releaseVersion: 1,
    compiled: compileAgentConfiguration({
      release: createAIConfigReleaseFixture(),
      system: SYSTEM_AI_CONFIG_PROJECTION,
      profileKey: "admin",
    }),
  };
  const workflow = startWorkflowAgentTurn(
    configuration,
    initializeWorkflow(configuration, "catalog-edit", "Запрос"),
  );
  let run: AIDocument = {
    id: 50,
    eventCursor: 4,
    status,
    turnContext: { agentConfiguration: configuration, workflow },
  };
  const events: AIStreamEvent[] = [];
  const operations: string[] = [];
  vi.mocked(lockAITransaction).mockImplementation(async () => {
    operations.push("lock");
  });
  const read = vi
    .spyOn(AIRepository.prototype, "getRun")
    .mockImplementation(async (_id, owner) => {
      operations.push("read");
      if (owner !== 1) throw new Error("foreign owner");
      return structuredClone(run);
    });
  vi.spyOn(AIRepository.prototype, "persistEvent").mockImplementation(
    async (event) => {
      operations.push("event");
      events.push(event);
      return true;
    },
  );
  const update = vi
    .spyOn(AIRepository.prototype, "updateRun")
    .mockImplementation(async (_id, data) => {
      operations.push("update");
      run = { ...run, ...data };
      return structuredClone(run);
    });
  const cancel = vi.fn(async () => {
    operations.push("remote");
    expect(run.status).toBe("cancelled");
    expect(
      (run.turnContext as { workflow: { phase: string } }).workflow.phase,
    ).toBe("blocked");
  });
  vi.mocked(getControlPlaneClient).mockReturnValue({
    cancelRun: cancel,
  } as unknown as ReturnType<typeof getControlPlaneClient>);
  return {
    run: () => run,
    setCursor: (cursor: number) => {
      run.eventCursor = cursor;
    },
    options: {} as SanitizedRealizeAIPluginOptions,
    req: { payload: { db: { defaultIDType: "number" } } } as PayloadRequest,
    cancel,
    read,
    update,
    operations,
    events,
  };
};

describe("workflow cancellation", () => {
  it.each(["queued", "running"])(
    "commits local %s cancellation before best-effort remote cancellation",
    async (status) => {
      const test = fixture(status);
      await cancelWorkflowRun(test.req, test.options, 1, "50");
      expect(test.operations).toEqual([
        "lock",
        "read",
        "event",
        "update",
        "update",
        "remote",
      ]);
      expect(test.events[0]).toMatchObject({
        type: "run.cancelled",
        sequence: 5,
        runID: "50",
      });
      expect(test.run()).toMatchObject({
        status: "cancelled",
        eventCursor: 5,
        turnContext: {
          workflow: { phase: "blocked", reason: "Выполнение шага отменено." },
        },
      });
    },
  );

  it.each(["not found", "unreachable"])(
    "keeps local cancellation if CP is %s",
    async (reason) => {
      const test = fixture();
      test.cancel.mockRejectedValueOnce(new Error(reason));
      await expect(
        cancelWorkflowRun(test.req, test.options, 1, "50"),
      ).resolves.toBeUndefined();
      expect(test.run().status).toBe("cancelled");
      expect(test.events).toHaveLength(1);
    },
  );

  it("reads the event cursor under the shared projection lock and replays without another event", async () => {
    const test = fixture();
    vi.mocked(lockAITransaction).mockImplementation(async () =>
      test.setCursor(9),
    );
    await cancelWorkflowRun(test.req, test.options, 1, "50");
    expect(test.events[0].sequence).toBe(10);
    vi.mocked(lockAITransaction).mockResolvedValue(undefined);
    await cancelWorkflowRun(test.req, test.options, 1, "50");
    expect(test.events).toHaveLength(1);
    expect(test.run().status).toBe("cancelled");
  });

  it.each(["completed", "failed"])(
    "does not overwrite terminal %s state",
    async (status) => {
      const test = fixture(status);
      await expect(
        cancelWorkflowRun(test.req, test.options, 1, "50"),
      ).rejects.toThrow("уже завершён");
      expect(test.events).toHaveLength(0);
      expect(test.cancel).not.toHaveBeenCalled();
    },
  );

  it("does not cancel a foreign owner's run", async () => {
    const test = fixture();
    await expect(
      cancelWorkflowRun(test.req, test.options, 2, "50"),
    ).rejects.toThrow("foreign owner");
    expect(test.events).toHaveLength(0);
    expect(test.cancel).not.toHaveBeenCalled();
  });

  it("does not call remote cancellation when persistence fails", async () => {
    const test = fixture();
    test.update.mockRejectedValueOnce(new Error("write failed"));
    await expect(
      cancelWorkflowRun(test.req, test.options, 1, "50"),
    ).rejects.toThrow("write failed");
    expect(test.cancel).not.toHaveBeenCalled();
  });
});
