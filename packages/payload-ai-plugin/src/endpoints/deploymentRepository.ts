/**
 * @file packages/payload-ai-plugin/src/endpoints/deploymentRepository.ts
 * @owner packages/payload-ai-plugin
 * @purpose Persists local-preview deployment jobs and reads their bounded evidence.
 */

import type { Payload, PayloadRequest } from "payload";

import { CHECK_RESULTS_SLUG, DEPLOYMENTS_SLUG } from "../constants";
import type { AIDocument } from "./repository";

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
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
    this.defaultIDType = payload.db.defaultIDType;
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
      { limit: 1, sort: "-createdAt" },
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
