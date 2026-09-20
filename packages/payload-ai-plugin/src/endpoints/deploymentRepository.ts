/**
 * @file packages/payload-ai-plugin/src/endpoints/deploymentRepository.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Сохраняет попытки preview и атомарно переводит их Change Request в очередь.
 */

import type { Payload, PayloadRequest } from "payload";
import { sql, type PostgresAdapter } from "@payloadcms/db-postgres";

import { CHECK_RESULTS_SLUG, DEPLOYMENTS_SLUG } from "../constants";
import type { AIDocument } from "./repository";
import { EndpointError } from "./http";

type FindResult = { docs: AIDocument[]; totalDocs: number };
type UntypedLocalAPI = {
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  find: (args: Record<string, unknown>) => Promise<FindResult>;
  update: (args: Record<string, unknown>) => Promise<AIDocument>;
};

/** Narrow Local API owner for preview deployment persistence. */
export class DeploymentRepository {
  private readonly api: UntypedLocalAPI;
  private readonly defaultIDType: "number" | "text";

  constructor(
    private readonly payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
    this.defaultIDType = payload.db.defaultIDType;
  }

  /** Блокирует CR до повторного чтения и создания попытки в общей Payload transaction. */
  async lockChangeRequest(changeRequestID: string): Promise<void> {
    const transaction = await this.transaction();
    await transaction.execute(
      sql`SELECT id FROM realize_ai_change_requests
          WHERE id = ${this.documentID(changeRequestID)} FOR UPDATE`,
    );
  }

  /** SQL CAS связывает постановку в очередь с версией, проверенной под row lock. */
  async queueChangeRequest(input: {
    changeRequestID: string;
    expectedState: string;
    expectedVersion: number;
  }): Promise<void> {
    const transaction = await this.transaction();
    const result = await transaction.execute(
      sql`UPDATE realize_ai_change_requests
             SET state = 'preview_queued', version = version + 1,
                 blocked_reason = NULL, updated_at = now()
           WHERE id = ${this.documentID(input.changeRequestID)}
             AND state = ${input.expectedState}
             AND version = ${input.expectedVersion}
           RETURNING id`,
    );
    if (result.rows.length !== 1)
      throw new EndpointError(
        "CONFLICT",
        "Preview queue state changed concurrently.",
        409,
      );
  }

  private async transaction() {
    const adapter = this.payload.db as Pick<
      PostgresAdapter,
      "name" | "sessions"
    >;
    const transactionID = await this.req.transactionID;
    const transaction =
      transactionID == null
        ? undefined
        : adapter.sessions?.[String(transactionID)]?.db;
    if (adapter.name !== "postgres" || !transaction)
      throw new Error(
        "Preview queue requires an active PostgreSQL transaction.",
      );
    return transaction;
  }

  async createDeployment(input: {
    baseCommit: string;
    boundImplementationHash: string;
    branch: string;
    changeRequestID: string;
    deploymentKey: string;
    executionJobID: string;
    expiresAt: string;
    idempotencyKey: string;
    initiatedBy: number | string;
    requiredChecks: string[];
    sourceDiffHash: string;
    sourceEvidenceHash: string;
    workspaceID: string;
  }): Promise<AIDocument> {
    return await this.api.create({
      collection: DEPLOYMENTS_SLUG,
      data: {
        artifactKind: "local-git-preview",
        attempt: 0,
        baseCommit: input.baseCommit,
        boundImplementationHash: input.boundImplementationHash,
        branch: input.branch,
        changeRequest: this.documentID(input.changeRequestID),
        deploymentKey: input.deploymentKey,
        environment: "local-preview",
        executionJob: this.documentID(input.executionJobID),
        expiresAt: input.expiresAt,
        idempotencyKey: input.idempotencyKey,
        initiatedBy: input.initiatedBy,
        requiredChecks: input.requiredChecks,
        runtimeState: "pending",
        sourceDiffHash: input.sourceDiffHash,
        sourceEvidenceHash: input.sourceEvidenceHash,
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
    const result = await this.find({
      and: [
        { initiatedBy: { equals: userID } },
        { idempotencyKey: { equals: idempotencyKey } },
      ],
    });
    return result.docs[0];
  }

  async getLatestDeployment(
    changeRequestID: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(
      { changeRequest: { equals: this.documentID(changeRequestID) } },
      { limit: 1, sort: ["-createdAt", "-id"] },
    );
    return result.docs[0];
  }

  async getDeployment(deploymentID: string): Promise<AIDocument | undefined> {
    const result = await this.find({
      id: { equals: this.documentID(deploymentID) },
    });
    return result.docs[0];
  }

  async listCheckResults(deploymentID: string): Promise<AIDocument[]> {
    const result = await this.api.find({
      collection: CHECK_RESULTS_SLUG,
      depth: 0,
      limit: 100,
      overrideAccess: true,
      pagination: false,
      req: this.req,
      sort: "sequence",
      where: { deployment: { equals: this.documentID(deploymentID) } },
    });
    return result.docs;
  }

  async updateDecision(
    deploymentID: string,
    status: "accepted" | "rejected",
  ): Promise<AIDocument> {
    return await this.api.update({
      collection: DEPLOYMENTS_SLUG,
      data: { status },
      id: this.documentID(deploymentID),
      overrideAccess: true,
      req: this.req,
    });
  }

  private documentID(value: number | string): number | string {
    if (this.defaultIDType === "text") return String(value);
    const id = Number(value);
    if (!Number.isInteger(id)) throw new Error("Document ID is invalid.");
    return id;
  }

  private async find(
    where: Record<string, unknown>,
    options: Record<string, unknown> = {},
  ): Promise<FindResult> {
    return await this.api.find({
      collection: DEPLOYMENTS_SLUG,
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
