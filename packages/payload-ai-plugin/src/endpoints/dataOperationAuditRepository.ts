/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationAuditRepository.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Сохраняет append-only DataOperation approvals и audit/outbox events.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type { Payload, PayloadRequest } from "payload";

import {
  DATA_OPERATION_APPROVALS_SLUG,
  DATA_OPERATION_EVENTS_SLUG,
} from "../constants";
import { EndpointError } from "./http";
import type { AIDocument } from "./repository";

type FindResult = { docs: AIDocument[]; totalDocs: number };
type UntypedLocalAPI = {
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  find: (args: Record<string, unknown>) => Promise<FindResult>;
};

/** Append-only persistence owner for decisions and outgoing events. */
export class DataOperationAuditRepository {
  private readonly api: UntypedLocalAPI;
  private readonly defaultIDType: "number" | "text";

  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
    this.defaultIDType = payload.db.defaultIDType;
  }

  async createApproval(input: {
    actor: number | string;
    boundHash: string;
    comment?: string;
    dataOperationID: string;
    decision: "approved" | "rejected";
    decisionKey: string;
    expiresAt: string;
    idempotencyKey: string;
    operationVersion: number;
    roles: string[];
    targetHash: string;
    type: "ROLLBACK_APPROVAL" | "WRITE_CONFIRMATION";
  }): Promise<AIDocument> {
    return await this.create(DATA_OPERATION_APPROVALS_SLUG, {
      actor: input.actor,
      boundHash: input.boundHash,
      comment: input.comment,
      dataOperation: this.documentID(input.dataOperationID),
      decision: input.decision,
      decisionKey: input.decisionKey,
      expiresAt: input.expiresAt,
      idempotencyKey: input.idempotencyKey,
      operationVersion: input.operationVersion,
      roleSnapshot: input.roles,
      targetHash: input.targetHash,
      type: input.type,
    });
  }

  async createEvent(input: {
    actor?: number | string;
    dataOperationID: string;
    fromState?: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    toState: string;
    type: string;
  }): Promise<AIDocument> {
    return await this.create(DATA_OPERATION_EVENTS_SLUG, {
      actor: input.actor,
      dataOperation: this.documentID(input.dataOperationID),
      deliveryStatus: "pending",
      fromState: input.fromState,
      idempotencyKey: input.idempotencyKey,
      occurredAt: new Date().toISOString(),
      payload: input.payload,
      toState: input.toState,
      topic: `realize.data-operation.${input.type}`,
      type: input.type,
    });
  }

  async getApproval(
    dataOperationID: string,
    type: "ROLLBACK_APPROVAL" | "WRITE_CONFIRMATION",
  ): Promise<AIDocument | undefined> {
    const result = await this.api.find({
      collection: DATA_OPERATION_APPROVALS_SLUG,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req: this.req,
      sort: "-createdAt",
      where: {
        and: [
          { dataOperation: { equals: this.documentID(dataOperationID) } },
          { type: { equals: type } },
        ],
      },
    });
    return result.docs[0];
  }

  /** Читает фактическое свидетельство подготовки exact immutable preview. */
  async getPreviewEvent(
    dataOperationID: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.api.find({
      collection: DATA_OPERATION_EVENTS_SLUG,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req: this.req,
      where: {
        and: [
          { dataOperation: { equals: this.documentID(dataOperationID) } },
          { idempotencyKey: { equals: `preview:${dataOperationID}` } },
          { type: { equals: "preview_created" } },
        ],
      },
    });
    return result.docs[0];
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
}
