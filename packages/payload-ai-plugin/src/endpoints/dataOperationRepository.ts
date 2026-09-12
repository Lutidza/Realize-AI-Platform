/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationRepository.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Сохраняет DataOperation aggregate и защищает переходы состояния.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type { Payload, PayloadRequest } from "payload";

import { DATA_OPERATIONS_SLUG, MESSAGES_SLUG } from "../constants";
import { EndpointError } from "./http";
import { relationID } from "./mappers";
import { AIRepository, type AIDocument } from "./repository";

type FindResult = { docs: AIDocument[]; totalDocs: number };
type BulkUpdateResult = { docs: AIDocument[]; errors?: unknown[] };
type UntypedLocalAPI = {
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  find: (args: Record<string, unknown>) => Promise<FindResult>;
  update: (
    args: Record<string, unknown>,
  ) => Promise<AIDocument | BulkUpdateResult>;
};

export type DataOperationRecords = {
  approval?: AIDocument;
  operation: AIDocument;
  rollbackApproval?: AIDocument;
};

/** Хранит управляемые операции данных и обеспечивает их переходы состояния. */
export class DataOperationRepository {
  private readonly api: UntypedLocalAPI;
  private readonly conversations: AIRepository;
  private readonly defaultIDType: "number" | "text";

  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
    this.conversations = new AIRepository(payload, req);
    this.defaultIDType = payload.db.defaultIDType;
  }

  async createOperation(input: {
    afterSnapshot: unknown;
    beforeSnapshot: unknown;
    categoryID?: string;
    categorySnapshot?: unknown;
    conversationID: string;
    expectedTargetUpdatedAt?: string;
    expiresAt: string;
    idempotencyKey: string;
    intent: unknown;
    operationHash: string;
    originalRequest: string;
    productID?: string;
    productSnapshot?: unknown;
    requestedBy: number | string;
    rollbackHash: string;
    sourceMessageID: string;
    sourceMessageKey?: string;
    title: string;
    kind?: "catalog.assignCategory.v1" | "pages.createDraft.v1";
  }): Promise<AIDocument> {
    return await this.create(DATA_OPERATIONS_SLUG, {
      afterSnapshot: input.afterSnapshot,
      approvalPolicy: "WRITE_CONFIRMATION",
      beforeSnapshot: input.beforeSnapshot,
      category: input.categoryID
        ? this.documentID(input.categoryID)
        : undefined,
      categorySnapshot: input.categorySnapshot,
      conversation: this.documentID(input.conversationID),
      estimatedCount: 1,
      expectedTargetUpdatedAt: input.expectedTargetUpdatedAt,
      expiresAt: input.expiresAt,
      idempotencyKey: input.idempotencyKey,
      intent: input.intent,
      kind: input.kind ?? "catalog.assignCategory.v1",
      operationHash: input.operationHash,
      originalRequest: input.originalRequest,
      product: input.productID ? this.documentID(input.productID) : undefined,
      productSnapshot: input.productSnapshot,
      requestedBy: input.requestedBy,
      riskLevel: "R1",
      rollbackHash: input.rollbackHash,
      rollbackStrategy:
        input.kind === "pages.createDraft.v1"
          ? "delete-created-draft"
          : "before-snapshot",
      sourceMessage: this.documentID(input.sourceMessageID),
      // Workflow identity формируется сервером для одного root run и шага.
      sourceMessageKey:
        input.sourceMessageKey ??
        `${input.conversationID}:${input.sourceMessageID}`,
      state: "awaiting_approval",
      title: input.title,
      version: 1,
    });
  }

  async findByIdempotencyKey(
    userID: number | string,
    idempotencyKey: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(DATA_OPERATIONS_SLUG, {
      and: [
        { requestedBy: { equals: userID } },
        { idempotencyKey: { equals: idempotencyKey } },
      ],
    });
    return result.docs[0];
  }

  async findBySourceMessage(
    conversationID: string,
    sourceMessageID: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(DATA_OPERATIONS_SLUG, {
      sourceMessageKey: { equals: `${conversationID}:${sourceMessageID}` },
    });
    return result.docs[0];
  }

  /** Читает exact исходный запрос без ограничения общей истории диалога. */
  async requireWorkflowSourceMessage(input: {
    conversationID: string;
    sourceMessageID: string;
    rootRunID: string;
    userID: number | string;
  }): Promise<AIDocument> {
    await this.conversations.requireOwnedConversation(
      input.conversationID,
      input.userID,
    );
    const result = await this.find(MESSAGES_SLUG, {
      and: [
        { id: { equals: this.documentID(input.sourceMessageID) } },
        { conversation: { equals: this.documentID(input.conversationID) } },
        { role: { equals: "user" } },
        { runID: { equals: input.rootRunID } },
      ],
    });
    const message = result.docs[0];
    if (!message)
      throw new EndpointError(
        "CONFLICT",
        "Сохранённый источник операции не относится к исходному запуску процесса.",
        409,
      );
    return message;
  }

  async getOwnedOperation(
    id: string,
    userID: number | string,
  ): Promise<AIDocument> {
    const result = await this.find(DATA_OPERATIONS_SLUG, {
      id: { equals: this.documentID(id) },
    });
    const operation = result.docs[0];
    if (!operation) {
      throw new EndpointError(
        "NOT_FOUND",
        "Data Operation was not found.",
        404,
      );
    }
    await this.conversations.requireOwnedConversation(
      relationID(operation.conversation),
      userID,
    );
    return operation;
  }

  async listOwnedOperations(
    conversationID: string,
    userID: number | string,
  ): Promise<DataOperationRecords[]> {
    await this.conversations.requireOwnedConversation(conversationID, userID);
    const result = await this.find(
      DATA_OPERATIONS_SLUG,
      { conversation: { equals: this.documentID(conversationID) } },
      { limit: 100, sort: "createdAt" },
    );
    return result.docs.map((operation) => ({ operation }));
  }

  async transition(input: {
    data: Record<string, unknown>;
    expectedState: string;
    expectedVersion: number;
    id: string;
  }): Promise<AIDocument> {
    const result = await this.api.update({
      collection: DATA_OPERATIONS_SLUG,
      data: input.data,
      limit: 1,
      overrideAccess: true,
      req: this.req,
      where: {
        and: [
          { id: { equals: this.documentID(input.id) } },
          { state: { equals: input.expectedState } },
          { version: { equals: input.expectedVersion } },
        ],
      },
    });
    const bulk = Array.isArray((result as BulkUpdateResult).docs)
      ? (result as BulkUpdateResult)
      : undefined;
    const docs = bulk ? bulk.docs : [result as AIDocument];
    const operation = docs[0];
    if (!operation) {
      throw new EndpointError(
        "CONFLICT",
        "Data Operation changed concurrently. Reload before continuing.",
        409,
      );
    }
    return operation;
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
      pagination: false,
      req: this.req,
      sort: options.sort,
      where,
    });
  }
}
