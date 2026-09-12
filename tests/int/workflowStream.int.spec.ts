// @vitest-environment node
/**
 * @file tests/int/workflowStream.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-12
 * @description Проверяет, что SSE выдаёт только принятые события и durable отмена побеждает поздние ошибки.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeSSE, type AIStreamEvent } from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";
import { createRunEventsHandler } from "../../packages/payload-ai-plugin/src/endpoints/stream";
import { ControlPlaneUnavailableError } from "../../packages/payload-ai-plugin/src/runtime/ControlPlaneUnavailable.error";

const ports = vi.hoisted(() => ({
  getRun: vi.fn(),
  listEvents: vi.fn(),
  findEventSequence: vi.fn(),
  streamRun: vi.fn(),
  workflowPersist: vi.fn(),
  ordinaryPersist: vi.fn(),
  requireChatUser: vi.fn(),
}));

vi.mock("../../packages/payload-ai-plugin/src/endpoints/repository", () => ({
  AIRepository: class {
    getRun = ports.getRun;
    listEvents = ports.listEvents;
    findEventSequence = ports.findEventSequence;
  },
}));
vi.mock("../../packages/payload-ai-plugin/src/endpoints/mappers", () => ({
  toStreamEvent: (event: AIStreamEvent) => structuredClone(event),
}));
vi.mock("../../packages/payload-ai-plugin/src/endpoints/access", () => ({
  requireChatUser: ports.requireChatUser,
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient",
  () => ({
    getControlPlaneClient: () => ({ streamRun: ports.streamRun }),
  }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/chat-context/persistWorkflowAgentEvent.service",
  () => ({
    persistWorkflowAgentEvent: ports.workflowPersist,
  }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/eventPersistence",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../packages/payload-ai-plugin/src/endpoints/eventPersistence")
    >()),
    persistAndApplyEvent: ports.ordinaryPersist,
  }),
);

const event = (
  type: AIStreamEvent["type"],
  sequence: number,
  payload: AIStreamEvent["payload"] = {},
): AIStreamEvent => ({
  id: `run-1-${sequence}-${type}`,
  runID: "run-1",
  createdAt: "2026-09-11T12:00:00.000Z",
  sequence,
  type,
  payload,
  visibility: "user-visible",
});

let journal: AIStreamEvent[];
let storedRun: {
  id: string;
  status: string;
  turnContext: { workflow?: { phase: string } };
};

const persistCancellation = (sequence = journal.length + 1) => {
  const cancelled = event("run.cancelled", sequence);
  storedRun.status = "cancelled";
  storedRun.turnContext.workflow = { phase: "blocked" };
  journal.push(cancelled);
  return cancelled;
};

const providerStream = (...events: AIStreamEvent[]) =>
  new Response(events.map(encodeSSE).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });

const openStream = async (
  options: { enabled?: boolean; lastEventID?: string } = {},
) => {
  const req = {
    routeParams: { id: "run-1" },
    headers: new Headers(
      options.lastEventID ? { "last-event-id": options.lastEventID } : {},
    ),
    payload: { logger: { error: vi.fn() } },
  } as unknown as PayloadRequest;
  const handler = createRunEventsHandler({
    enabled: options.enabled ?? true,
  } as SanitizedRealizeAIPluginOptions);
  const response = await handler(req);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const body = await response.text();
  const events = body.split("\n\n").flatMap((frame) => {
    const data = frame.split("\n").find((line) => line.startsWith("data: "));
    return data ? [JSON.parse(data.slice(6)) as AIStreamEvent] : [];
  });
  return { events, req };
};

beforeEach(() => {
  Object.values(ports).forEach((port) => port.mockReset());
  journal = [event("run.started", 1, { threadID: "thread-one" })];
  storedRun = {
    id: "run-1",
    status: "running",
    turnContext: { workflow: { phase: "running" } },
  };
  ports.requireChatUser.mockResolvedValue({ id: "admin-1" });
  ports.getRun.mockImplementation(async () => structuredClone(storedRun));
  ports.findEventSequence.mockImplementation(
    async (id: string) => journal.find((item) => item.id === id)?.sequence || 0,
  );
  ports.listEvents.mockImplementation(
    async (_runID: string, afterSequence: number) =>
      structuredClone(journal.filter((item) => item.sequence > afterSequence)),
  );
  ports.workflowPersist.mockImplementation(
    async (_req: unknown, _userID: string, next: AIStreamEvent) => {
      if (storedRun.status === "cancelled") return false;
      journal.push(structuredClone(next));
      if (next.type === "run.failed") {
        storedRun.status = "failed";
        storedRun.turnContext.workflow = { phase: "blocked" };
      }
      return true;
    },
  );
  ports.ordinaryPersist.mockImplementation(
    async (_repository: unknown, next: AIStreamEvent) => {
      journal.push(structuredClone(next));
    },
  );
});

describe("workflow SSE accepted-event projection", () => {
  it("replays durable cancellation instead of a late provider completion", async () => {
    const late = event("assistant.completed", 2, {
      content: "Late answer must not win.",
    });
    ports.streamRun.mockImplementation(async () => {
      persistCancellation();
      return providerStream(late);
    });
    const { events } = await openStream();
    expect(events.map((item) => item.type)).toEqual([
      "run.started",
      "run.cancelled",
    ]);
    expect(events).toEqual(journal);
    expect(ports.workflowPersist).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      late,
    );
    expect(
      events.some((item) => item.payload.content === late.payload.content),
    ).toBe(false);
    expect(ports.ordinaryPersist).not.toHaveBeenCalled();
  });

  it("persists a CP 404 failure through the workflow owner before forwarding it", async () => {
    ports.streamRun.mockRejectedValue(
      new ControlPlaneUnavailableError("Missing runtime run", 404),
    );
    const { events, req } = await openStream();
    expect(events.map((item) => item.type)).toEqual([
      "run.started",
      "run.failed",
    ]);
    const failure = events[1];
    expect(failure.id).toBe("workflow:run-1:runtime-lost");
    expect(failure.sequence).toBe(2);
    expect(failure.payload.message).toContain("Runtime перезапущен");
    expect(ports.workflowPersist).toHaveBeenCalledWith(req, "admin-1", failure);
    expect(events).toEqual(journal);
    expect(storedRun).toMatchObject({
      status: "failed",
      turnContext: { workflow: { phase: "blocked" } },
    });
  });

  it("does not forward synthetic CP 404 failure when durable cancel wins", async () => {
    ports.streamRun.mockImplementation(async () => {
      persistCancellation();
      throw new ControlPlaneUnavailableError("Missing runtime run", 404);
    });
    const { events } = await openStream();
    expect(ports.workflowPersist).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      expect.objectContaining({
        id: "workflow:run-1:runtime-lost",
        type: "run.failed",
      }),
    );
    expect(events.map((item) => item.type)).toEqual([
      "run.started",
      "run.cancelled",
    ]);
    expect(events).toEqual(journal);
    expect(storedRun.status).toBe("cancelled");
  });

  it("replays cancellation when premature EOF creates a rejected synthetic failure", async () => {
    ports.streamRun.mockImplementation(async () => {
      persistCancellation();
      return providerStream();
    });
    const { events } = await openStream();
    expect(ports.workflowPersist).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      expect.objectContaining({
        type: "run.failed",
        payload: {
          message: "Control-plane stream ended before run completion.",
        },
      }),
    );
    expect(events.map((item) => item.type)).toEqual([
      "run.started",
      "run.cancelled",
    ]);
    expect(events).toEqual(journal);
  });

  it("continues an accepted run with enabled false and replays cancellation over late completion", async () => {
    const late = event("assistant.completed", 2, {
      content: "Late answer must not win.",
    });
    ports.streamRun.mockResolvedValue(providerStream(late));
    ports.workflowPersist.mockImplementation(async () => {
      persistCancellation();
      return false;
    });
    const { events, req } = await openStream({ enabled: false });
    expect(ports.streamRun).toHaveBeenCalledWith(
      "run-1",
      1,
      expect.any(AbortSignal),
    );
    expect(ports.workflowPersist).toHaveBeenCalledExactlyOnceWith(
      req,
      "admin-1",
      late,
    );
    expect(events.map((item) => item.type)).toEqual([
      "run.started",
      "run.cancelled",
    ]);
    expect(events).toEqual(journal);
    expect(storedRun.status).toBe("cancelled");
    expect(ports.ordinaryPersist).not.toHaveBeenCalled();
  });

  it("honours Last-Event-ID when cancellation replaces a rejected provider event", async () => {
    const cursor = journal[0].id;
    ports.streamRun.mockImplementation(async () => {
      persistCancellation();
      return providerStream(
        event("assistant.delta", 2, { delta: "unaccepted" }),
      );
    });
    const { events } = await openStream({ lastEventID: cursor });
    expect(ports.streamRun).toHaveBeenCalledWith(
      "run-1",
      1,
      expect.any(AbortSignal),
    );
    expect(events).toEqual([journal[1]]);
    expect(events[0].type).toBe("run.cancelled");
    expect(ports.listEvents).toHaveBeenLastCalledWith("run-1", 1);
  });

  it("keeps ordinary chat on its existing persistence port and completed SSE contract", async () => {
    storedRun.turnContext = {};
    const completed = event("assistant.completed", 2, {
      content: "Ordinary reply",
    });
    ports.streamRun.mockResolvedValue(providerStream(completed));
    const { events } = await openStream();
    expect(events.map((item) => item.type)).toEqual([
      "run.started",
      "assistant.completed",
    ]);
    expect(ports.ordinaryPersist).toHaveBeenCalledWith(
      expect.anything(),
      completed,
    );
    expect(ports.workflowPersist).not.toHaveBeenCalled();
    expect(events).toEqual(journal);
  });
});
