/**
 * @file packages/payload-ai-plugin/src/endpoints/sourcePromotionRepository.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Владеет Payload persistence для durable source promotion queue.
 */

import type { Payload, PayloadRequest } from "payload";

import { SOURCE_PROMOTIONS_SLUG } from "../constants";
import type { AIDocument } from "./repository";

type FindResult = { docs: AIDocument[]; totalDocs: number };
type UntypedLocalAPI = {
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  find: (args: Record<string, unknown>) => Promise<FindResult>;
  update: (args: Record<string, unknown>) => Promise<AIDocument>;
};

/** Узкий Local API repository для source-control promotion records. */
export class SourcePromotionRepository {
  private readonly api: UntypedLocalAPI;
  private readonly defaultIDType: "number" | "text";

  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
    this.defaultIDType = payload.db.defaultIDType;
  }

  async createPromotion(input: {
    baseBranch: string;
    changeRequestID: string;
    gitCommit: string;
    headBranch: string;
    idempotencyKey: string;
    initiatedBy: number | string;
    integrationRevision: number;
    previewDeploymentID: string;
    promotionKey: string;
    repositorySlug: string;
    sourceAcceptanceHash: string;
    sourcePreviewArtifactHash: string;
    sourcePreviewEvidenceHash: string;
  }): Promise<AIDocument> {
    return await this.api.create({
      collection: SOURCE_PROMOTIONS_SLUG,
      data: {
        attempt: 0,
        baseBranch: input.baseBranch,
        changeRequest: this.documentID(input.changeRequestID),
        gitCommit: input.gitCommit,
        headBranch: input.headBranch,
        idempotencyKey: input.idempotencyKey,
        initiatedBy: input.initiatedBy,
        integrationRevision: input.integrationRevision,
        previewDeployment: this.documentID(input.previewDeploymentID),
        promotionKey: input.promotionKey,
        provider: "github",
        repositorySlug: input.repositorySlug,
        sourceAcceptanceHash: input.sourceAcceptanceHash,
        sourcePreviewArtifactHash: input.sourcePreviewArtifactHash,
        sourcePreviewEvidenceHash: input.sourcePreviewEvidenceHash,
        stage: "queued",
        status: "queued",
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

  async getLatestPromotion(
    changeRequestID: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(
      { changeRequest: { equals: this.documentID(changeRequestID) } },
      { limit: 1, sort: "-createdAt" },
    );
    return result.docs[0];
  }

  async getPromotion(promotionID: string): Promise<AIDocument | undefined> {
    const result = await this.find({
      id: { equals: this.documentID(promotionID) },
    });
    return result.docs[0];
  }

  async requeuePromotion(input: {
    integrationRevision: number;
    promotionID: number | string;
  }): Promise<AIDocument> {
    return await this.api.update({
      collection: SOURCE_PROMOTIONS_SLUG,
      data: {
        completedAt: null,
        errorSummary: null,
        integrationRevision: input.integrationRevision,
        stage: "queued",
        status: "queued",
        workerID: null,
      },
      id: this.documentID(input.promotionID),
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
      collection: SOURCE_PROMOTIONS_SLUG,
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
