/**
 * @file packages/payload-ai-plugin/src/endpoints/repository.ts
 * @version 1.2.0
 * @date 2026-10-23
 * @description Выполняет узкие Local API операции с явной проверкой владельца.
 */

import { parseChatSources } from "@realize/ai-contracts";
import type { ChatMessageContext } from "../chat-context/ChatAttachment.types";
import type { ChatRunContext } from "../chat-context/ChatRunContext.types";

import { isDeepStrictEqual } from "node:util";

import type { AIStreamEvent } from "@realize/ai-contracts";
import type { Payload, PayloadRequest } from "payload";

import {
  CONVERSATIONS_SLUG,
  MESSAGES_SLUG,
  RUN_EVENTS_SLUG,
  RUNS_SLUG,
} from "../constants";
import { EndpointError } from "./http";
import { relationID } from "./mappers";

export type AIDocument = Record<string, unknown> & {
  createdAt?: string;
  id: number | string;
  updatedAt?: string;
};

type FindResult = {
  docs: AIDocument[];
  totalDocs: number;
};

type UntypedLocalAPI = {
  count: (args: Record<string, unknown>) => Promise<{ totalDocs: number }>;
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  find: (args: Record<string, unknown>) => Promise<FindResult>;
  update: (args: Record<string, unknown>) => Promise<AIDocument>;
};

export class AIRepository {
  private readonly api: UntypedLocalAPI;
  private readonly defaultIDType: "number" | "text";

  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
    this.defaultIDType = payload.db.defaultIDType;
  }

  async archiveConversation(
    id: string,
    userID: number | string,
  ): Promise<AIDocument> {
    await this.requireOwnedConversation(id, userID);
    return await this.update(CONVERSATIONS_SLUG, this.documentID(id), {
      status: "archived",
    });
  }

  async createConversation(
    title: string,
    userID: number | string,
    idempotencyKey: string,
  ): Promise<AIDocument> {
    const now = new Date().toISOString();
    return await this.create(CONVERSATIONS_SLUG, {
      createdBy: userID,
      idempotencyKey,
      lastMessageAt: now,
      status: "active",
      title,
    });
  }

  async createRun(input: {
    conversationID: string;
    idempotencyKey: string;
    model?: string;
    requestedBy: number | string;
    requestHash?: string;
    turnContext?: ChatRunContext;
    threadID?: string;
  }): Promise<AIDocument> {
    return await this.create(RUNS_SLUG, {
      conversation: this.documentID(input.conversationID),
      eventCursor: 0,
      idempotencyKey: input.idempotencyKey,
      model: input.model,
      provider: "openai-codex",
      requestedBy: input.requestedBy,
      requestHash: input.requestHash,
      turnContext: input.turnContext,
      sandboxProfile:
        input.turnContext?.ownerEngineering?.mode === "owner-host"
          ? "owner-host"
          : "analysis-readonly",
      status: "queued",
      threadID: input.threadID,
    });
  }

  async createUserMessage(input: {
    content: string;
    conversationID: string;
    idempotencyKey: string;
    runID: string;
    turnContext?: ChatMessageContext;
  }): Promise<AIDocument> {
    const count = await this.api.count({
      collection: MESSAGES_SLUG,
      overrideAccess: true,
      req: this.req,
      where: {
        conversation: { equals: this.documentID(input.conversationID) },
      },
    });
    return await this.create(MESSAGES_SLUG, {
      content: input.content,
      turnContext: input.turnContext,
      conversation: this.documentID(input.conversationID),
      idempotencyKey: input.idempotencyKey,
      kind: "user_message",
      role: "user",
      runID: input.runID,
      sequence: count.totalDocs + 1,
    });
  }

  async findEventSequence(eventID: string, runID: string): Promise<number> {
    const result = await this.find(RUN_EVENTS_SLUG, {
      and: [
        { eventID: { equals: eventID } },
        { run: { equals: this.documentID(runID) } },
      ],
    });
    return Number(result.docs[0]?.sequence || 0);
  }

  async findConversationByIdempotencyKey(
    userID: number | string,
    idempotencyKey: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(CONVERSATIONS_SLUG, {
      and: [
        { createdBy: { equals: userID } },
        { idempotencyKey: { equals: idempotencyKey } },
      ],
    });
    return result.docs[0];
  }

  async findRunByIdempotencyKey(
    conversationID: string,
    idempotencyKey: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(RUNS_SLUG, {
      and: [
        { conversation: { equals: this.documentID(conversationID) } },
        { idempotencyKey: { equals: idempotencyKey } },
      ],
    });
    return result.docs[0];
  }

  async getConversationDetail(
    id: string,
    userID: number | string,
  ): Promise<{
    conversation: AIDocument;
    messages: AIDocument[];
    runs: AIDocument[];
  }> {
    const conversation = await this.requireOwnedConversation(id, userID);
    const [messages, runs] = await Promise.all([
      this.find(
        MESSAGES_SLUG,
        { conversation: { equals: this.documentID(id) } },
        { limit: 200, sort: "sequence" },
      ),
      this.find(
        RUNS_SLUG,
        { conversation: { equals: this.documentID(id) } },
        { limit: 100, sort: "createdAt" },
      ),
    ]);
    return { conversation, messages: messages.docs, runs: runs.docs };
  }

  async getLatestThreadID(
    conversationID: string,
    runtimeContextHash?: string,
  ): Promise<string | undefined> {
    const result = await this.find(
      RUNS_SLUG,
      {
        and: [
          { conversation: { equals: this.documentID(conversationID) } },
          { status: { equals: "completed" } },
          { threadID: { exists: true } },
        ],
      },
      { limit: 1, sort: "-createdAt" },
    );
    const context = result.docs[0]?.turnContext;
    const previousHash =
      context && typeof context === "object" && "runtimeContextHash" in context
        ? context.runtimeContextHash
        : undefined;
    if (previousHash !== runtimeContextHash) return undefined;
    return typeof result.docs[0]?.threadID === "string"
      ? result.docs[0].threadID
      : undefined;
  }

  async getRun(id: string, userID: number | string): Promise<AIDocument> {
    const result = await this.find(RUNS_SLUG, {
      id: { equals: this.documentID(id) },
    });
    const run = result.docs[0];
    if (!run)
      throw new EndpointError("NOT_FOUND", "AI run was not found.", 404);
    await this.requireOwnedConversation(relationID(run.conversation), userID);
    return run;
  }

  async listConversations(userID: number | string): Promise<AIDocument[]> {
    const result = await this.find(
      CONVERSATIONS_SLUG,
      { createdBy: { equals: userID } },
      { limit: 100, sort: "-lastMessageAt" },
    );
    return result.docs;
  }

  async listEvents(
    runID: string,
    afterSequence: number,
  ): Promise<AIDocument[]> {
    const result = await this.find(
      RUN_EVENTS_SLUG,
      {
        and: [
          { run: { equals: this.documentID(runID) } },
          { sequence: { greater_than: afterSequence } },
        ],
      },
      { limit: 500, sort: "sequence" },
    );
    return result.docs;
  }

  /**
   * Persists one event and returns false for a matching replay, including a
   * concurrent insert won by another SSE bridge.
   *
   * @returns True only when this call created the durable event record.
   * @throws When persistence fails or the event ID belongs to another envelope.
   */
  async persistEvent(event: AIStreamEvent): Promise<boolean> {
    const existing = await this.findEventByID(event.id);
    if (existing) {
      this.assertMatchingEvent(existing, event);
      return false;
    }

    try {
      await this.create(RUN_EVENTS_SLUG, {
        eventID: event.id,
        occurredAt: event.createdAt,
        payload: event.payload,
        run: this.documentID(event.runID),
        sequence: event.sequence,
        type: event.type,
        visibility: event.visibility,
      });
      return true;
    } catch (error) {
      let concurrentWinner: AIDocument | undefined;
      try {
        concurrentWinner = await this.findEventByID(event.id);
      } catch {
        throw error;
      }
      if (!concurrentWinner) throw error;

      this.assertMatchingEvent(concurrentWinner, event);
      return false;
    }
  }

  async persistAssistantMessage(
    event: AIStreamEvent,
    content: string,
  ): Promise<void> {
    const idempotencyKey = `assistant:${event.id}`;
    const existing = await this.find(MESSAGES_SLUG, {
      idempotencyKey: { equals: idempotencyKey },
    });
    if (existing.totalDocs > 0) return;

    const run = await this.find(RUNS_SLUG, {
      id: { equals: this.documentID(event.runID) },
    });
    const conversationID = relationID(run.docs[0]?.conversation);
    if (!conversationID) return;

    const count = await this.api.count({
      collection: MESSAGES_SLUG,
      overrideAccess: true,
      req: this.req,
      where: {
        conversation: { equals: this.documentID(conversationID) },
      },
    });
    await this.create(MESSAGES_SLUG, {
      content,
      sources: parseChatSources(event.payload.sources),
      conversation: this.documentID(conversationID),
      idempotencyKey,
      kind: "assistant_message",
      role: "assistant",
      runID: event.runID,
      sequence: count.totalDocs + 1,
    });
    await this.update(CONVERSATIONS_SLUG, conversationID, {
      lastMessageAt: event.createdAt,
    });
  }

  async updateRun(
    id: string,
    data: Record<string, unknown>,
  ): Promise<AIDocument> {
    return await this.update(RUNS_SLUG, this.documentID(id), data);
  }

  async touchConversation(id: string): Promise<void> {
    await this.update(CONVERSATIONS_SLUG, this.documentID(id), {
      lastMessageAt: new Date().toISOString(),
    });
  }

  private async create(
    collection: string,
    data: Record<string, unknown>,
  ): Promise<AIDocument> {
    return await this.api.create({
      collection,
      data,
      overrideAccess: true,
      req: this.req,
    });
  }

  private assertMatchingEvent(
    document: AIDocument,
    event: AIStreamEvent,
  ): void {
    const occurredAt =
      typeof document.occurredAt === "string"
        ? Date.parse(document.occurredAt)
        : Number.NaN;
    const createdAt = Date.parse(event.createdAt);
    const matches =
      document.eventID === event.id &&
      relationID(document.run) === event.runID &&
      Number(document.sequence) === event.sequence &&
      document.type === event.type &&
      document.visibility === event.visibility &&
      Number.isFinite(occurredAt) &&
      occurredAt === createdAt &&
      isDeepStrictEqual(document.payload, event.payload);

    if (!matches) throw new Error("AI event identity collision.");
  }

  private documentID(value: number | string): number | string {
    if (this.defaultIDType === "text") return String(value);
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(numeric) || numeric < 1) {
      throw new EndpointError(
        "INVALID_REQUEST",
        "Document ID is invalid.",
        400,
      );
    }
    return numeric;
  }

  private async find(
    collection: string,
    where: Record<string, unknown>,
    options: { limit?: number; sort?: string } = {},
  ): Promise<FindResult> {
    return await this.api.find({
      collection,
      depth: 0,
      limit: options.limit || 1,
      overrideAccess: true,
      pagination: true,
      req: this.req,
      sort: options.sort,
      where,
    });
  }

  private async findEventByID(
    eventID: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(RUN_EVENTS_SLUG, {
      eventID: { equals: eventID },
    });
    return result.docs[0];
  }

  async requireOwnedConversation(
    id: string,
    userID: number | string,
  ): Promise<AIDocument> {
    const result = await this.find(CONVERSATIONS_SLUG, {
      and: [
        { id: { equals: this.documentID(id) } },
        { createdBy: { equals: userID } },
      ],
    });
    const conversation = result.docs[0];
    if (!conversation)
      throw new EndpointError("NOT_FOUND", "Conversation was not found.", 404);
    return conversation;
  }

  private async update(
    collection: string,
    id: number | string,
    data: Record<string, unknown>,
  ): Promise<AIDocument> {
    return await this.api.update({
      collection,
      data,
      id,
      overrideAccess: true,
      req: this.req,
    });
  }
}
