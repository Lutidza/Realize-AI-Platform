/**
 * @file packages/payload-ai-plugin/src/endpoints/releaseRepository.ts
 * @version 2026-08-22
 * @description Владеет Payload Local API для очереди OCI-кандидатов и release evidence.
 */

import type { Payload, PayloadRequest } from "payload";

import { RELEASE_CANDIDATES_SLUG } from "../constants";
import type { AIDocument } from "./repository";

type FindResult = { docs: AIDocument[]; totalDocs: number };
type UntypedLocalAPI = {
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  find: (args: Record<string, unknown>) => Promise<FindResult>;
  update: (args: Record<string, unknown>) => Promise<AIDocument>;
};

/** Узкий persistence owner для provider-neutral release aggregate. */
export class ReleaseRepository {
  private readonly api: UntypedLocalAPI;
  private readonly defaultIDType: "number" | "text";

  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
    this.defaultIDType = payload.db.defaultIDType;
  }

  async createCandidate(input: {
    candidateKey: string;
    changeRequestID: string;
    expiresAt: string;
    gitCommit: string;
    idempotencyKey: string;
    initiatedBy: number | string;
    previewDeploymentID: string;
    sourceAcceptanceHash: string;
    sourcePreviewArtifactHash: string;
    sourcePreviewEvidenceHash: string;
  }): Promise<AIDocument> {
    return await this.api.create({
      collection: RELEASE_CANDIDATES_SLUG,
      data: {
        artifactKind: "oci-image",
        attempt: 0,
        candidateKey: input.candidateKey,
        changeRequest: this.documentID(input.changeRequestID),
        environment: "oci-preview",
        expiresAt: input.expiresAt,
        gitCommit: input.gitCommit,
        idempotencyKey: input.idempotencyKey,
        initiatedBy: input.initiatedBy,
        migrations: [],
        pluginVersions: {},
        previewDeployment: this.documentID(input.previewDeploymentID),
        previewStatus: "pending",
        signatureVerified: false,
        sourceAcceptanceHash: input.sourceAcceptanceHash,
        sourcePreviewArtifactHash: input.sourcePreviewArtifactHash,
        sourcePreviewEvidenceHash: input.sourcePreviewEvidenceHash,
        stage: "queued",
        status: "queued",
        targetEnvironment: "production",
      },
      overrideAccess: true,
      req: this.req,
    });
  }

  async findByIdempotencyKey(
    changeRequestID: string,
    userID: number | string,
    idempotencyKey: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find({
      and: [
        {
          changeRequest: { equals: this.documentID(changeRequestID) },
        },
        { initiatedBy: { equals: userID } },
        { idempotencyKey: { equals: idempotencyKey } },
      ],
    });
    return result.docs[0];
  }

  async getLatestCandidate(
    changeRequestID: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(
      { changeRequest: { equals: this.documentID(changeRequestID) } },
      { limit: 1, sort: "-createdAt" },
    );
    return result.docs[0];
  }

  async getCandidate(candidateID: string): Promise<AIDocument | undefined> {
    const result = await this.find({
      id: { equals: this.documentID(candidateID) },
    });
    return result.docs[0];
  }

  async updateDecision(
    candidateID: string,
    status: "approved" | "rejected",
  ): Promise<AIDocument> {
    return await this.api.update({
      collection: RELEASE_CANDIDATES_SLUG,
      data: { status },
      id: this.documentID(candidateID),
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
      collection: RELEASE_CANDIDATES_SLUG,
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
