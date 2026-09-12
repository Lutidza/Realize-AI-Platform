// @vitest-environment node
/**
 * @file tests/int/workflowSegments.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет durable workflow-сегменты через реальные сервисы с изолированными storage и CP ports.
 */
import type {
  AIConfigArtifact,
  AIStreamEvent,
  CreateMessageInput,
  WorkflowStep,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_CONFIG_ARTIFACTS,
  createAIConfigDraftFixture,
  createAIConfigReleaseFixture,
} from "./fixtures/aiConfiguration";
import { createWorkflowMessage } from "../../packages/payload-ai-plugin/src/chat-context/createWorkflowMessage.service";
import { continueWorkflow } from "../../packages/payload-ai-plugin/src/chat-context/continueWorkflow.service";
import { dispatchWorkflowSegment } from "../../packages/payload-ai-plugin/src/chat-context/dispatchWorkflowSegment.service";
import { persistWorkflowAgentEvent } from "../../packages/payload-ai-plugin/src/chat-context/persistWorkflowAgentEvent.service";
import { cancelWorkflowRun } from "../../packages/payload-ai-plugin/src/chat-context/cancelWorkflowRun.service";
import {
  AIRepository,
  type AIDocument,
} from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { AIConfigRepository } from "../../packages/payload-ai-plugin/src/endpoints/aiConfigRepository";
import { EndpointError } from "../../packages/payload-ai-plugin/src/endpoints/http";
import { idempotencyKeyFor } from "../../packages/payload-ai-plugin/src/endpoints/request";
import type { ChatRunContext } from "../../packages/payload-ai-plugin/src/chat-context/ChatRunContext.types";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";

const ports = vi.hoisted(() => ({
  startRun: vi.fn(),
  cancelRun: vi.fn(),
  transactionTail: Promise.resolve(),
  snapshot: (): unknown => undefined,
  restore: (_value: unknown): void => undefined,
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient",
  () => ({ getControlPlaneClient: () => ports }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/lockAITransaction.util",
  () => ({ lockAITransaction: vi.fn().mockResolvedValue(undefined) }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/payloadTransaction",
  () => ({
    withPayloadTransaction: async (
      _req: unknown,
      work: () => Promise<unknown>,
    ) => {
      const previous = ports.transactionTail;
      let release!: () => void;
      ports.transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const snapshot = ports.snapshot();
      try {
        return await work();
      } catch (error) {
        ports.restore(snapshot);
        throw error;
      } finally {
        release();
      }
    },
  }),
);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  ports.startRun.mockReset().mockResolvedValue(undefined);
  ports.cancelRun.mockReset().mockResolvedValue(undefined);
  ports.transactionTail = Promise.resolve();
});

const fixture = (questionFirst = true) => {
  const steps: WorkflowStep[] = [
    ...(questionFirst
      ? [
          {
            key: "question",
            type: "request_input" as const,
            promptTemplateKey: "planner",
            nextStepKey: "first",
          },
        ]
      : []),
    {
      key: "first",
      type: "agent_turn",
      promptTemplateKey: "planner",
      nextStepKey: "second",
    },
    {
      key: "second",
      type: "agent_turn",
      promptTemplateKey: "planner",
      nextStepKey: "done",
    },
    { key: "done", type: "finish", outcome: "completed" },
  ];
  const artifacts: AIConfigArtifact[] = AI_CONFIG_ARTIFACTS.map((artifact) =>
    artifact.kind === "workflow_definition"
      ? {
          ...artifact,
          steps,
          entryStepKey: steps[0].key,
          maxSteps: steps.length,
        }
      : artifact,
  );
  const release = createAIConfigReleaseFixture(
    createAIConfigDraftFixture(artifacts),
  );
  const active = vi
    .spyOn(AIConfigRepository.prototype, "getActivePointer")
    .mockResolvedValue({
      id: 20,
      version: 1,
      releaseID: release.id,
      manifestHash: release.manifestHash,
      activatedAt: release.createdAt,
      activatedBy: 1,
    });
  vi.spyOn(AIConfigRepository.prototype, "requireRelease").mockResolvedValue({
    id: 10,
    releaseID: release.id,
    artifacts: release.artifacts,
    releasedAt: release.createdAt,
    createdBy: release.createdBy,
    manifestHash: release.manifestHash,
    schemaVersion: release.schemaVersion,
    sourceDraftID: release.sourceDraftID,
    sourceDraftRevision: release.sourceDraftRevision,
    version: release.version,
    systemMinimumRelease: release.systemCompatibility.minimumRelease,
    systemMaximumRelease: release.systemCompatibility.maximumRelease,
  });
  let records = {
    runs: [] as AIDocument[],
    messages: [] as AIDocument[],
    events: [] as AIStreamEvent[],
  };
  let archived = false;
  let nextID = 50;
  ports.snapshot = () => structuredClone(records);
  ports.restore = (value) => {
    records = value as typeof records;
  };
  const requireOwner = (owner: number | string) => {
    if (String(owner) !== "1")
      throw new EndpointError("NOT_FOUND", "Conversation was not found.", 404);
  };
  const getRun = (id: string) => {
    const run = records.runs.find((item) => String(item.id) === id);
    if (!run) throw new Error("Run not found");
    return run;
  };
  vi.spyOn(AIRepository.prototype, "getConversationDetail").mockImplementation(
    async (_id, owner) => {
      requireOwner(owner);
      return structuredClone({
        conversation: { id: 4, status: archived ? "archived" : "active" },
        messages: records.messages,
        runs: records.runs,
      });
    },
  );
  vi.spyOn(AIRepository.prototype, "getRun").mockImplementation(
    async (id, owner) => {
      requireOwner(owner);
      return structuredClone(getRun(id));
    },
  );
  vi.spyOn(
    AIRepository.prototype,
    "findRunByIdempotencyKey",
  ).mockImplementation(async (conversationID, key) =>
    structuredClone(
      records.runs.find(
        (run) =>
          String(run.conversation) === conversationID &&
          run.idempotencyKey === key,
      ),
    ),
  );
  const createRun = vi
    .spyOn(AIRepository.prototype, "createRun")
    .mockImplementation(async (input) => {
      if (
        records.runs.some((run) => run.idempotencyKey === input.idempotencyKey)
      )
        throw new Error("unique constraint");
      const run: AIDocument = {
        id: nextID++,
        conversation: Number(input.conversationID),
        requestedBy: input.requestedBy,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        turnContext: structuredClone(input.turnContext),
        status: "queued",
        eventCursor: 0,
        model: input.model,
        sandboxProfile: "analysis-readonly",
        createdAt: "2026-09-11T00:00:00.000Z",
      };
      records.runs.push(run);
      return structuredClone(run);
    });
  vi.spyOn(AIRepository.prototype, "createUserMessage").mockImplementation(
    async (input) => {
      const message: AIDocument = {
        ...input,
        id: nextID++,
        conversation: Number(input.conversationID),
        role: "user",
        kind: "user_message",
        sequence: records.messages.length + 1,
        createdAt: "2026-09-11T00:00:00.000Z",
      };
      records.messages.push(message);
      return structuredClone(message);
    },
  );
  const persistEvent = vi
    .spyOn(AIRepository.prototype, "persistEvent")
    .mockImplementation(async (event) => {
      const existing = records.events.find((item) => item.id === event.id);
      if (existing) {
        expect(event).toEqual(existing);
        return false;
      }
      records.events.push(structuredClone(event));
      return true;
    });
  vi.spyOn(AIRepository.prototype, "findEventSequence").mockImplementation(
    async (id, runID) =>
      records.events.find((item) => item.id === id && item.runID === runID)
        ?.sequence ?? 0,
  );
  vi.spyOn(
    AIRepository.prototype,
    "persistAssistantMessage",
  ).mockImplementation(async (event, content) => {
    records.messages.push({
      id: nextID++,
      conversation: 4,
      runID: event.runID,
      role: "assistant",
      kind: "assistant_message",
      content,
      sequence: records.messages.length + 1,
    });
  });
  const updateRun = vi
    .spyOn(AIRepository.prototype, "updateRun")
    .mockImplementation(async (id, data) => {
      Object.assign(getRun(id), structuredClone(data));
      return structuredClone(getRun(id));
    });
  vi.spyOn(AIRepository.prototype, "touchConversation").mockResolvedValue(
    undefined,
  );
  const req = {
    payload: { db: { defaultIDType: "number" } },
    user: { id: 1 },
  } as PayloadRequest;
  const options = {
    enabled: true,
    runtime: { model: "fixture-model" },
  } as SanitizedRealizeAIPluginOptions;
  const input: CreateMessageInput = {
    content: "Разберите запрос",
    agentConfiguration: {
      releaseID: release.id,
      manifestHash: release.manifestHash,
      profileKey: "admin",
    },
    workflow: { key: "catalog-edit", input: { subject: "Каталог" } },
  };
  const start = () =>
    createWorkflowMessage(req, options, 1, "4", "workflow-start-key", input);
  const context = (id: string) => getRun(id).turnContext as ChatRunContext;
  const continueInput = (id: string, content?: string) => ({
    expectedVersion: context(id).workflow!.version,
    expectedStepKey: context(id).workflow!.stepKey,
    ...(content === undefined ? {} : { content }),
  });
  const completedEvent = (id: string, sequence = 1): AIStreamEvent => ({
    id: `provider:${id}:${sequence}`,
    runID: id,
    sequence,
    createdAt: "2026-09-11T01:00:00.000Z",
    type: "assistant.completed",
    visibility: "user-visible",
    payload: { content: `Ответ ${id}` },
  });
  return {
    req,
    options,
    input,
    start,
    context,
    continueInput,
    completedEvent,
    getRun,
    active,
    createRun,
    persistEvent,
    updateRun,
    records: () => records,
    archive: () => {
      archived = true;
    },
  };
};

describe("workflow segment creation and continuation", () => {
  it("persists request_input without calling CP and exposes no private checkpoint inputs", async () => {
    const test = fixture();
    const result = await test.start();
    expect(result.run).toMatchObject({
      status: "completed",
      workflow: { phase: "awaiting_input", stepKey: "question" },
    });
    expect(JSON.stringify(result.run)).not.toContain("subject");
    expect(test.context(result.run.id).workflow?.input).toMatchObject({
      subject: "Каталог",
      request: "Разберите запрос",
    });
    expect(test.records().messages).toHaveLength(2);
    expect(ports.startRun).not.toHaveBeenCalled();
  });

  it("executes two agent segments with separate provider turns and immutable parents", async () => {
    const test = fixture(false);
    const first = await test.start();
    expect(first.run.status).toBe("queued");
    expect(ports.startRun).toHaveBeenCalledTimes(1);
    await persistWorkflowAgentEvent(
      test.req,
      1,
      test.completedEvent(first.run.id),
    );
    const parent = structuredClone(test.getRun(first.run.id));
    const second = await continueWorkflow(
      test.req,
      test.options,
      1,
      first.run.id,
      test.continueInput(first.run.id),
    );
    expect(ports.startRun).toHaveBeenCalledTimes(2);
    expect(test.context(second.run.id).workflow).toMatchObject({
      parentRunID: first.run.id,
      rootRunID: first.run.id,
      phase: "running",
      stepKey: "second",
      outputs: { first: { text: `Ответ ${first.run.id}` } },
    });
    expect(test.getRun(first.run.id)).toEqual(parent);
    await persistWorkflowAgentEvent(
      test.req,
      1,
      test.completedEvent(second.run.id),
    );
    const terminal = await continueWorkflow(
      test.req,
      test.options,
      1,
      second.run.id,
      test.continueInput(second.run.id),
    );
    expect(terminal.run).toMatchObject({
      status: "completed",
      workflow: { phase: "completed" },
    });
    expect(ports.startRun).toHaveBeenCalledTimes(2);
  });

  it("continues with historical configuration after the active pointer is removed", async () => {
    const test = fixture();
    const first = await test.start();
    const historical = structuredClone(
      test.context(first.run.id).agentConfiguration,
    );
    test.active.mockResolvedValue(undefined);
    test.active.mockClear();
    const result = await continueWorkflow(
      test.req,
      test.options,
      1,
      first.run.id,
      test.continueInput(first.run.id, "Ответ администратора"),
    );
    expect(test.context(result.run.id).agentConfiguration).toEqual(historical);
    expect(test.active).not.toHaveBeenCalled();
    expect(ports.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ agentConfiguration: historical }),
    );
  });

  it("replays one child exactly and rejects another response without overwriting the parent", async () => {
    const test = fixture();
    const first = await test.start();
    const parent = structuredClone(test.getRun(first.run.id));
    const input = test.continueInput(first.run.id, "Первый ответ");
    const child = await continueWorkflow(
      test.req,
      test.options,
      1,
      first.run.id,
      input,
    );
    await expect(
      continueWorkflow(test.req, test.options, 1, first.run.id, input),
    ).resolves.toMatchObject({ run: { id: child.run.id } });
    await expect(
      continueWorkflow(test.req, test.options, 1, first.run.id, {
        ...input,
        content: "Другой ответ",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(test.records().runs).toHaveLength(2);
    expect(test.getRun(first.run.id)).toEqual(parent);
  });

  it("rejects stale version, wrong step, foreign owner and archived conversation", async () => {
    const test = fixture();
    const first = await test.start();
    const input = test.continueInput(first.run.id, "Ответ");
    await expect(
      continueWorkflow(test.req, test.options, 1, first.run.id, {
        ...input,
        expectedVersion: input.expectedVersion + 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      continueWorkflow(test.req, test.options, 1, first.run.id, {
        ...input,
        expectedStepKey: "other",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      continueWorkflow(test.req, test.options, 2, first.run.id, input),
    ).rejects.toMatchObject({ status: 404 });
    test.archive();
    await expect(
      continueWorkflow(test.req, test.options, 1, first.run.id, input),
    ).rejects.toMatchObject({ status: 409 });
    expect(test.records().runs).toHaveLength(1);
  });

  it("retries a queued first segment with exactly the same run ID and transport after CP 503", async () => {
    const test = fixture(false);
    ports.startRun.mockRejectedValueOnce(new Error("unreachable"));
    await expect(test.start()).rejects.toMatchObject({ status: 503 });
    const request = structuredClone(ports.startRun.mock.calls[0][0]);
    test.active.mockResolvedValue(undefined);
    const replay = await test.start();
    expect(replay.run.id).toBe(request.runID);
    expect(ports.startRun.mock.calls[1][0]).toEqual(request);
    expect(test.records().runs).toHaveLength(1);
    expect(test.records().messages).toHaveLength(1);
  });

  it("recovers a queued segment through continue after reload without creating a child or message", async () => {
    const test = fixture(false);
    ports.startRun.mockRejectedValueOnce(new Error("unreachable"));
    await expect(test.start()).rejects.toMatchObject({ status: 503 });
    const request = structuredClone(ports.startRun.mock.calls[0][0]);
    const queued = structuredClone(test.records().runs[0]);
    const runID = String(queued.id);
    test.active.mockResolvedValue(undefined);
    test.active.mockClear();

    const recovered = await continueWorkflow(
      test.req,
      test.options,
      1,
      runID,
      test.continueInput(runID),
    );

    expect(recovered).toMatchObject({ run: { id: runID, status: "queued" } });
    expect(recovered.message).toBeUndefined();
    expect(ports.startRun.mock.calls[1][0]).toEqual(request);
    expect(test.records().runs).toEqual([queued]);
    expect(test.records().messages).toHaveLength(1);
    expect(test.createRun).toHaveBeenCalledTimes(1);
    expect(test.active).not.toHaveBeenCalled();
  });

  it.each(["version", "step", "content"])(
    "rejects an invalid queued recovery %s without dispatch or a new child",
    async (mutation) => {
      const test = fixture(false);
      ports.startRun.mockRejectedValueOnce(new Error("unreachable"));
      await expect(test.start()).rejects.toMatchObject({ status: 503 });
      const runID = String(test.records().runs[0].id);
      const input = test.continueInput(runID);
      if (mutation === "version") input.expectedVersion += 1;
      if (mutation === "step") input.expectedStepKey = "second";
      if (mutation === "content") input.content = "Новый ответ";
      ports.startRun.mockClear();

      await expect(
        continueWorkflow(test.req, test.options, 1, runID, input),
      ).rejects.toMatchObject({ status: 409 });

      expect(ports.startRun).not.toHaveBeenCalled();
      expect(test.records().runs).toHaveLength(1);
      expect(test.records().messages).toHaveLength(1);
      expect(test.getRun(runID).status).toBe("queued");
    },
  );

  it("cannot recover a queued segment after durable cancellation", async () => {
    const test = fixture(false);
    ports.startRun.mockRejectedValueOnce(new Error("unreachable"));
    await expect(test.start()).rejects.toMatchObject({ status: 503 });
    const runID = String(test.records().runs[0].id);
    const input = test.continueInput(runID);
    await cancelWorkflowRun(test.req, test.options, 1, runID);
    const cancelled = structuredClone(test.getRun(runID));
    ports.startRun.mockClear();

    await expect(
      continueWorkflow(test.req, test.options, 1, runID, input),
    ).rejects.toMatchObject({ status: 409 });

    expect(test.getRun(runID)).toEqual(cancelled);
    expect(test.records().runs).toHaveLength(1);
    expect(test.records().messages).toHaveLength(1);
    expect(ports.startRun).not.toHaveBeenCalled();
  });

  it("claims one child for simultaneous identical resumes before any provider dispatch", async () => {
    const test = fixture();
    const first = await test.start();
    const input = test.continueInput(first.run.id, "Ответ");
    const [left, right] = await Promise.all([
      continueWorkflow(test.req, test.options, 1, first.run.id, input),
      continueWorkflow(test.req, test.options, 1, first.run.id, input),
    ]);
    expect(left.run.id).toBe(right.run.id);
    expect(test.records().runs).toHaveLength(2);
    expect(
      test.records().messages.filter((message) => message.role === "user"),
    ).toHaveLength(2);
    expect(
      new Set(ports.startRun.mock.calls.map(([request]) => request.runID)).size,
    ).toBe(1);
  });

  it("rolls back the child claim and reply when preparing the segment fails", async () => {
    const test = fixture();
    const first = await test.start();
    test.updateRun.mockRejectedValueOnce(new Error("database failure"));
    await expect(
      continueWorkflow(
        test.req,
        test.options,
        1,
        first.run.id,
        test.continueInput(first.run.id, "Ответ"),
      ),
    ).rejects.toThrow("database failure");
    expect(test.records().runs).toHaveLength(1);
    expect(test.records().messages).toHaveLength(2);
    expect(ports.startRun).not.toHaveBeenCalled();
  });
});

describe("workflow cancellation and provider event races", () => {
  it("does not redispatch a stale queued object after durable cancellation", async () => {
    const test = fixture(false);
    const first = await test.start();
    const stale = structuredClone(test.getRun(first.run.id));
    await cancelWorkflowRun(test.req, test.options, 1, first.run.id);
    ports.startRun.mockClear();
    await expect(
      dispatchWorkflowSegment(stale, test.options, test.req, 1),
    ).resolves.toMatchObject({ status: "cancelled" });
    expect(ports.startRun).not.toHaveBeenCalled();
  });

  it("cancels CP again if cancellation wins while exact dispatch is in flight", async () => {
    const test = fixture(false);
    ports.startRun.mockImplementationOnce(async () => {
      throw new Error("unreachable");
    });
    await expect(test.start()).rejects.toMatchObject({ status: 503 });
    const saved = structuredClone(test.records().runs[0]);
    ports.startRun.mockImplementationOnce(async () => {
      await cancelWorkflowRun(test.req, test.options, 1, String(saved.id));
    });
    await expect(
      dispatchWorkflowSegment(saved, test.options, test.req, 1),
    ).resolves.toMatchObject({ status: "cancelled" });
    expect(ports.cancelRun).toHaveBeenCalledTimes(2);
  });

  it("does not accept late provider completion or overwrite cancelled checkpoint", async () => {
    const test = fixture(false);
    const first = await test.start();
    await cancelWorkflowRun(test.req, test.options, 1, first.run.id);
    const cancelled = structuredClone(test.getRun(first.run.id));
    await expect(
      persistWorkflowAgentEvent(
        test.req,
        1,
        test.completedEvent(first.run.id, 9),
      ),
    ).resolves.toBe(false);
    expect(test.getRun(first.run.id)).toEqual(cancelled);
    expect(
      test
        .records()
        .events.some((event) => event.type === "assistant.completed"),
    ).toBe(false);
  });

  it("replays a committed provider completion without completing its step twice", async () => {
    const test = fixture(false);
    const first = await test.start();
    const event = test.completedEvent(first.run.id);
    await persistWorkflowAgentEvent(test.req, 1, event);
    const completed = structuredClone(test.getRun(first.run.id));
    await expect(persistWorkflowAgentEvent(test.req, 1, event)).resolves.toBe(
      true,
    );
    expect(test.getRun(first.run.id)).toEqual(completed);
    expect(test.records().events).toHaveLength(1);
  });

  it("rejects public keys that could claim an internal workflow child or capability identity", () => {
    const req = (key: string) =>
      ({ headers: new Headers({ "Idempotency-Key": key }) }) as PayloadRequest;
    expect(() => idempotencyKeyFor(req("workflow:child:50"))).toThrow();
    expect(() =>
      idempotencyKeyFor(req(`workflow:${"a".repeat(64)}`)),
    ).toThrow();
    expect(idempotencyKeyFor(req("public-request-key"))).toBe(
      "public-request-key",
    );
  });
});
