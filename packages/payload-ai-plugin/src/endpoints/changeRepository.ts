/**
 * @file packages/payload-ai-plugin/src/endpoints/changeRepository.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Сохраняет Change Requests и append-only approval decisions.
 */

import type { Payload, PayloadRequest } from "payload";

import {
  APPROVALS_SLUG,
  CHANGE_REQUESTS_SLUG,
  CONVERSATIONS_SLUG,
  MESSAGES_SLUG,
} from "../constants";
import { EndpointError } from "./http";
import { relationID } from "./mappers";
import type { AIDocument } from "./repository";

type FindResult = { docs: AIDocument[]; totalDocs: number };
type UntypedLocalAPI = {
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  find: (args: Record<string, unknown>) => Promise<FindResult>;
  update: (args: Record<string, unknown>) => Promise<AIDocument>;
};

/** Узкий repository для approval-gated Change Request aggregate. */
export class ChangeRepository {
  private readonly api: UntypedLocalAPI;
  private readonly defaultIDType: "number" | "text";

  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
    this.defaultIDType = payload.db.defaultIDType;
  }

  async createChange(input: {
    affectedPaths: string[];
    checks: string[];
    conversationID: string;
    expiresAt: string;
    idempotencyKey: string;
    normalizedIntent: string;
    originalRequest: string;
    plan: string;
    planHash: string;
    requestedBy: number | string;
    riskLevel: string;
    scopeHash: string;
    sourceMessageID: string;
    title: string;
    type: string;
  }): Promise<AIDocument> {
    return await this.create(CHANGE_REQUESTS_SLUG, {
      affectedPaths: input.affectedPaths,
      checks: input.checks,
      conversation: this.documentID(input.conversationID),
      expiresAt: input.expiresAt,
      idempotencyKey: input.idempotencyKey,
      normalizedIntent: input.normalizedIntent,
      originalRequest: input.originalRequest,
      plan: input.plan,
      planHash: input.planHash,
      requestedBy: input.requestedBy,
      riskLevel: input.riskLevel,
      scopeHash: input.scopeHash,
      sourceMessage: this.documentID(input.sourceMessageID),
      sourceMessageKey: `${input.conversationID}:${input.sourceMessageID}`,
      state: "awaiting_plan_approval",
      title: input.title,
      type: input.type,
      version: 1,
    });
  }

  async createApproval(input: {
    actor: number | string;
    boundHash: string;
    changeRequestID: string;
    comment?: string;
    decision: "approved" | "rejected";
    decisionKey: string;
    expiresAt: string;
    idempotencyKey: string;
    roles: string[];
    type?:
      | "IMPLEMENTATION_ACCEPTANCE"
      | "PLAN_APPROVAL"
      | "PREVIEW_ACCEPTANCE"
      | "RELEASE_APPROVAL";
    artifactHash?: string;
    diffHash?: string;
    imageDigest?: string;
    manifestHash?: string;
    migrationSetHash?: string;
    releaseCandidateID?: string;
    targetEnvironment?: string;
  }): Promise<AIDocument> {
    return await this.create(APPROVALS_SLUG, {
      actor: input.actor,
      artifactHash: input.artifactHash,
      boundHash: input.boundHash,
      changeRequest: this.documentID(input.changeRequestID),
      comment: input.comment,
      decision: input.decision,
      decisionKey: input.decisionKey,
      diffHash: input.diffHash,
      imageDigest: input.imageDigest,
      expiresAt: input.expiresAt,
      idempotencyKey: input.idempotencyKey,
      manifestHash: input.manifestHash,
      migrationSetHash: input.migrationSetHash,
      releaseCandidate: input.releaseCandidateID
        ? this.documentID(input.releaseCandidateID)
        : undefined,
      roleSnapshot: input.roles,
      targetEnvironment: input.targetEnvironment,
      type: input.type || "PLAN_APPROVAL",
    });
  }

  async findByIdempotencyKey(
    userID: number | string,
    idempotencyKey: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(CHANGE_REQUESTS_SLUG, {
      and: [
        { requestedBy: { equals: userID } },
        { idempotencyKey: { equals: idempotencyKey } },
      ],
    });
    return result.docs[0];
  }

  async findBySourceMessage(
    conversationID: string,
    messageID: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(CHANGE_REQUESTS_SLUG, {
      sourceMessageKey: { equals: `${conversationID}:${messageID}` },
    });
    return result.docs[0];
  }

  async getApproval(
    changeRequestID: string,
    type:
      | "IMPLEMENTATION_ACCEPTANCE"
      | "PLAN_APPROVAL"
      | "PREVIEW_ACCEPTANCE"
      | "RELEASE_APPROVAL" = "PLAN_APPROVAL",
  ): Promise<AIDocument | undefined> {
    const result = await this.find(
      APPROVALS_SLUG,
      {
        and: [
          { changeRequest: { equals: this.documentID(changeRequestID) } },
          { type: { equals: type } },
        ],
      },
      { limit: 1, sort: ["-createdAt", "-id"] },
    );
    return result.docs[0];
  }

  async getOwnedChange(
    id: string,
    userID: number | string,
  ): Promise<AIDocument> {
    const result = await this.find(CHANGE_REQUESTS_SLUG, {
      id: { equals: this.documentID(id) },
    });
    const change = result.docs[0];
    if (!change) {
      throw new EndpointError(
        "NOT_FOUND",
        "Change Request was not found.",
        404,
      );
    }
    await this.requireOwnedConversation(
      relationID(change.conversation),
      userID,
    );
    return change;
  }

  async getPlanSource(
    conversationID: string,
    messageID: string,
    userID: number | string,
  ): Promise<{ assistant: AIDocument; originalRequest: AIDocument }> {
    await this.requireOwnedConversation(conversationID, userID);
    const assistantResult = await this.find(MESSAGES_SLUG, {
      and: [
        { id: { equals: this.documentID(messageID) } },
        { conversation: { equals: this.documentID(conversationID) } },
      ],
    });
    const assistant = assistantResult.docs[0];
    if (!assistant || assistant.role !== "assistant") {
      throw new EndpointError(
        "INVALID_REQUEST",
        "Only an assistant message from this conversation can become a plan.",
        400,
      );
    }

    const userResult = await this.find(
      MESSAGES_SLUG,
      {
        and: [
          { conversation: { equals: this.documentID(conversationID) } },
          { role: { equals: "user" } },
          { sequence: { less_than: Number(assistant.sequence) } },
        ],
      },
      { limit: 1, sort: "-sequence" },
    );
    const originalRequest = userResult.docs[0];
    if (!originalRequest) {
      throw new EndpointError(
        "INVALID_REQUEST",
        "The assistant plan has no preceding user request.",
        400,
      );
    }
    return { assistant, originalRequest };
  }

  async listOwnedChanges(
    conversationID: string,
    userID: number | string,
  ): Promise<
    Array<{
      acceptance?: AIDocument;
      approval?: AIDocument;
      change: AIDocument;
      previewAcceptance?: AIDocument;
      releaseApproval?: AIDocument;
    }>
  > {
    await this.requireOwnedConversation(conversationID, userID);
    const result = await this.find(
      CHANGE_REQUESTS_SLUG,
      { conversation: { equals: this.documentID(conversationID) } },
      { limit: 100, sort: "createdAt" },
    );
    return await Promise.all(
      result.docs.map(async (change) => ({
        acceptance: await this.getApproval(
          String(change.id),
          "IMPLEMENTATION_ACCEPTANCE",
        ),
        approval: await this.getApproval(String(change.id)),
        change,
        previewAcceptance: await this.getApproval(
          String(change.id),
          "PREVIEW_ACCEPTANCE",
        ),
        releaseApproval: await this.getApproval(
          String(change.id),
          "RELEASE_APPROVAL",
        ),
      })),
    );
  }

  async updateDecision(
    id: string,
    decision: "approved" | "rejected",
    comment: string | undefined,
    nextVersion: number,
  ): Promise<AIDocument> {
    return await this.update(CHANGE_REQUESTS_SLUG, this.documentID(id), {
      blockedReason: decision === "rejected" ? comment : undefined,
      state: decision === "approved" ? "plan_approved" : "blocked",
      version: nextVersion,
    });
  }

  async updateState(
    id: string,
    input: { blockedReason?: string; state: string; version: number },
  ): Promise<AIDocument> {
    return await this.update(CHANGE_REQUESTS_SLUG, this.documentID(id), {
      blockedReason: input.blockedReason,
      state: input.state,
      version: input.version,
    });
  }

  private async requireOwnedConversation(
    id: string,
    userID: number | string,
  ): Promise<void> {
    const result = await this.find(CONVERSATIONS_SLUG, {
      and: [
        { id: { equals: this.documentID(id) } },
        { createdBy: { equals: userID } },
      ],
    });
    if (!result.docs[0]) {
      throw new EndpointError("NOT_FOUND", "Conversation was not found.", 404);
    }
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
    const id = Number(value);
    if (!Number.isInteger(id)) {
      throw new EndpointError(
        "INVALID_REQUEST",
        "Document ID is invalid.",
        400,
      );
    }
    return id;
  }
  private async find(
    collection: string,
    where: Record<string, unknown>,
    options: Record<string, unknown> = {},
  ): Promise<FindResult> {
    return await this.api.find({
      collection,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req: this.req,
      where,
      ...options,
    });
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
