/**
 * @file packages/payload-ai-plugin/src/endpoints/executionRepository.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Сохраняет очередь выполнения и читает проверки и состояние фонового исполнителя.
 */

import type { Payload, PayloadRequest } from "payload";

import { CHECK_RESULTS_SLUG, EXECUTION_JOBS_SLUG } from "../constants";
import { readWorkerPresence } from "../integrations/runtime/readWorkerPresence.service";
import type { WorkerPresenceSnapshot } from "../integrations/runtime/WorkerPresence.types";
import type { AIDocument } from "./repository";

type FindResult = { docs: AIDocument[]; totalDocs: number };
type UntypedLocalAPI = {
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  find: (args: Record<string, unknown>) => Promise<FindResult>;
};

/** Narrow Local API owner for execution queue persistence. */
export class ExecutionRepository {
  private readonly api: UntypedLocalAPI;
  private readonly defaultIDType: "number" | "text";

  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
    this.defaultIDType = payload.db.defaultIDType;
  }

  /** Снимок обслуживающего процесса читается независимо от durable состояния задания. */
  async readWorkerPresence(
    assignedInstanceKey?: string,
  ): Promise<WorkerPresenceSnapshot> {
    return readWorkerPresence(this.req, assignedInstanceKey);
  }

  async createJob(input: {
    allowedPaths: string[];
    approvedVersion: number;
    artifactsExpireAt: string;
    baseCommit: string;
    boundPlanHash: string;
    boundScopeHash: string;
    branch: string;
    capabilityExpiresAt: string;
    capabilityIssuedAt: string;
    capabilityNonce: string;
    capabilityTokenHash: string;
    changeRequestID: string;
    checks: string[];
    executionKey: string;
    idempotencyKey: string;
    requestedBy: number | string;
    workspaceID: string;
  }): Promise<AIDocument> {
    return await this.api.create({
      collection: EXECUTION_JOBS_SLUG,
      data: {
        allowedPaths: input.allowedPaths,
        approvedVersion: input.approvedVersion,
        artifactsExpireAt: input.artifactsExpireAt,
        attempt: 0,
        baseCommit: input.baseCommit,
        boundPlanHash: input.boundPlanHash,
        boundScopeHash: input.boundScopeHash,
        branch: input.branch,
        capabilityExpiresAt: input.capabilityExpiresAt,
        capabilityIssuedAt: input.capabilityIssuedAt,
        capabilityNonce: input.capabilityNonce,
        capabilityTokenHash: input.capabilityTokenHash,
        changeRequest: this.documentID(input.changeRequestID),
        checks: input.checks,
        diffTruncated: false,
        executionKey: input.executionKey,
        idempotencyKey: input.idempotencyKey,
        requestedBy: input.requestedBy,
        stage: "queued",
        status: "queued",
        workspaceID: input.workspaceID,
      },
      overrideAccess: true,
      req: this.req,
    });
  }

  async findByIdempotencyKey(
    userID: number | string,
    idempotencyKey: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(EXECUTION_JOBS_SLUG, {
      and: [
        { requestedBy: { equals: userID } },
        { idempotencyKey: { equals: idempotencyKey } },
      ],
    });
    return result.docs[0];
  }

  async getLatestJob(changeRequestID: string): Promise<AIDocument | undefined> {
    const result = await this.find(
      EXECUTION_JOBS_SLUG,
      { changeRequest: { equals: this.documentID(changeRequestID) } },
      { limit: 1, sort: "-createdAt" },
    );
    return result.docs[0];
  }

  async listCheckResults(executionJobID: string): Promise<AIDocument[]> {
    const result = await this.find(
      CHECK_RESULTS_SLUG,
      { executionJob: { equals: this.documentID(executionJobID) } },
      { limit: 100, sort: "sequence" },
    );
    return result.docs;
  }

  private documentID(value: number | string): number | string {
    if (this.defaultIDType === "text") return String(value);
    const id = Number(value);
    if (!Number.isInteger(id)) throw new Error("Document ID is invalid.");
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
}
