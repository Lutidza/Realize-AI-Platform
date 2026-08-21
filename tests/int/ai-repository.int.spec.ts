/**
 * @file tests/int/ai-repository.int.spec.ts
 * @version 2026-08-17
 * @description Verifies database-ID normalization and event idempotency at the Local API boundary.
 */

import type { AIStreamEvent } from "@realize/ai-contracts";
import type { Payload, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";

import { AIRepository } from "../../packages/payload-ai-plugin/src/endpoints/repository";

const repositoryWith = (defaultIDType: "number" | "text") => {
  const create = vi.fn().mockResolvedValue({ id: 1 });
  const find = vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 });
  const payload = {
    create,
    db: { defaultIDType },
    find,
  } as unknown as Payload;
  const repository = new AIRepository(payload, {} as PayloadRequest);
  return { create, find, repository };
};

const event: AIStreamEvent = {
  createdAt: "2026-08-17T12:00:00.000Z",
  id: "42-1-event-id",
  payload: { delta: "готово" },
  runID: "42",
  sequence: 1,
  type: "assistant.delta",
  visibility: "user-visible",
};

const persistedEvent = (overrides: Record<string, unknown> = {}) => ({
  eventID: event.id,
  id: 100,
  occurredAt: event.createdAt,
  payload: event.payload,
  run: 42,
  sequence: event.sequence,
  type: event.type,
  visibility: event.visibility,
  ...overrides,
});

describe("AIRepository IDs", () => {
  it("persists the conversation idempotency key", async () => {
    const { create, repository } = repositoryWith("number");

    await repository.createConversation("Диалог", 7, "conversation-123");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: "conversation-123",
        }),
      }),
    );
  });

  it("coerces route IDs for numeric Payload adapters", async () => {
    const { create, repository } = repositoryWith("number");

    await repository.createRun({
      conversationID: "42",
      idempotencyKey: "request-123",
      requestedBy: 7,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversation: 42 }),
      }),
    );
  });

  it("preserves text IDs and rejects malformed numeric IDs", async () => {
    const text = repositoryWith("text");
    await text.repository.createRun({
      conversationID: "conversation_42",
      idempotencyKey: "request-123",
      requestedBy: "user_7",
    });
    expect(text.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversation: "conversation_42" }),
      }),
    );

    const numeric = repositoryWith("number");
    await expect(
      numeric.repository.createRun({
        conversationID: "not-a-number",
        idempotencyKey: "request-123",
        requestedBy: 7,
      }),
    ).rejects.toThrow("Document ID is invalid.");
  });
});

describe("AIRepository event persistence", () => {
  it("creates a previously unseen event", async () => {
    const { create, repository } = repositoryWith("number");

    await expect(repository.persistEvent(event)).resolves.toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventID: event.id,
          run: 42,
          sequence: event.sequence,
        }),
      }),
    );
  });

  it("returns false for an already persisted matching replay", async () => {
    const { create, find, repository } = repositoryWith("number");
    find.mockResolvedValueOnce({
      docs: [persistedEvent()],
      totalDocs: 1,
    });

    await expect(repository.persistEvent(event)).resolves.toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts a matching concurrent insert winner", async () => {
    const { create, find, repository } = repositoryWith("number");
    find
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 })
      .mockResolvedValueOnce({
        docs: [persistedEvent()],
        totalDocs: 1,
      });
    create.mockRejectedValueOnce(new Error("Value must be unique"));

    await expect(repository.persistEvent(event)).resolves.toBe(false);
    expect(find).toHaveBeenCalledTimes(2);
  });

  it("fails closed when an event ID resolves to different content", async () => {
    const { find, repository } = repositoryWith("number");
    find.mockResolvedValueOnce({
      docs: [persistedEvent({ sequence: 2 })],
      totalDocs: 1,
    });

    await expect(repository.persistEvent(event)).rejects.toThrow(
      "AI event identity collision.",
    );
  });

  it("does not mask an unrelated create failure", async () => {
    const { create, repository } = repositoryWith("number");
    const failure = new Error("database unavailable");
    create.mockRejectedValueOnce(failure);

    await expect(repository.persistEvent(event)).rejects.toBe(failure);
  });
});
