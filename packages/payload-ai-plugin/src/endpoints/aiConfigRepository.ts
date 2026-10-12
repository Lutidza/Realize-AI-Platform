/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigRepository.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Сохраняет config drafts, immutable releases, pointers и replay events.
 * @docref Realize — AI Platform v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type {
  ActiveAIConfigPointer,
  AIConfigArtifact,
  AIConfigBaseReleaseDTO,
  AIConfigRelease,
} from "@realize/ai-contracts";
import type { Payload, PayloadRequest } from "payload";

import {
  ACTIVE_AI_CONFIG_POINTERS_SLUG,
  AI_CONFIG_DRAFTS_SLUG,
  AI_CONFIG_EVENTS_SLUG,
  AI_CONFIG_RELEASES_SLUG,
} from "../constants";
import { AIConfigPersistence } from "./aiConfigPersistence";
import { EndpointError } from "./http";
import type { AIDocument } from "./repository";

export type AIConfigEventAction =
  | "draft_created"
  | "draft_updated"
  | "draft_validated"
  | "release_created"
  | "config_activated"
  | "config_rolled_back";

const draftData = (input: {
  artifacts: readonly AIConfigArtifact[];
  baseRelease: AIConfigBaseReleaseDTO | null;
}) => ({
  artifacts: input.artifacts,
  baseReleaseID: input.baseRelease?.id ?? null,
  baseReleaseManifestHash: input.baseRelease?.manifestHash ?? null,
});

/** Narrow Local API owner; generic Payload CRUD remains denied. */
export class AIConfigRepository {
  private readonly persistence: AIConfigPersistence;

  constructor(payload: Payload, req: PayloadRequest) {
    this.persistence = new AIConfigPersistence(payload, req);
  }

  async listDrafts(): Promise<AIDocument[]> {
    return (
      await this.persistence.find(
        AI_CONFIG_DRAFTS_SLUG,
        {},
        { limit: 100, sort: "-updatedAt" },
      )
    ).docs;
  }

  async getDraft(draftID: string): Promise<AIDocument | undefined> {
    return (
      await this.persistence.find(AI_CONFIG_DRAFTS_SLUG, {
        draftID: { equals: draftID },
      })
    ).docs[0];
  }

  async requireDraft(draftID: string): Promise<AIDocument> {
    const draft = await this.getDraft(draftID);
    if (!draft) {
      throw new EndpointError(
        "NOT_FOUND",
        "AI configuration draft was not found.",
        404,
      );
    }
    return draft;
  }

  async createDraft(input: {
    actorID: number | string;
    artifacts: readonly AIConfigArtifact[];
    baseRelease: AIConfigBaseReleaseDTO | null;
    draftID: string;
  }): Promise<AIDocument> {
    return await this.persistence.create(AI_CONFIG_DRAFTS_SLUG, {
      ...draftData(input),
      createdBy: input.actorID,
      draftID: input.draftID,
      revision: 1,
      schemaVersion: "1.0",
      state: "editing",
      updatedBy: input.actorID,
    });
  }

  async replaceDraft(input: {
    actorID: number | string;
    artifacts: readonly AIConfigArtifact[];
    baseRelease: AIConfigBaseReleaseDTO | null;
    draftID: string;
    expectedRevision: number;
    expectedState: "editing" | "ready";
  }): Promise<AIDocument> {
    return await this.persistence.updateDraft({
      collection: AI_CONFIG_DRAFTS_SLUG,
      data: {
        ...draftData(input),
        revision: input.expectedRevision + 1,
        state: "editing",
        updatedBy: input.actorID,
      },
      draftID: input.draftID,
      expectedRevision: input.expectedRevision,
      expectedState: input.expectedState,
    });
  }

  async setDraftState(input: {
    actorID: number | string;
    draftID: string;
    expectedRevision: number;
    expectedState: "editing" | "ready";
    state: "ready" | "released";
  }): Promise<AIDocument> {
    return await this.persistence.updateDraft({
      collection: AI_CONFIG_DRAFTS_SLUG,
      data: {
        revision: input.expectedRevision + 1,
        state: input.state,
        updatedBy: input.actorID,
      },
      draftID: input.draftID,
      expectedRevision: input.expectedRevision,
      expectedState: input.expectedState,
    });
  }

  async listReleases(): Promise<AIDocument[]> {
    return (
      await this.persistence.find(
        AI_CONFIG_RELEASES_SLUG,
        {},
        { limit: 100, sort: "-version" },
      )
    ).docs;
  }

  async getRelease(releaseID: string): Promise<AIDocument | undefined> {
    return (
      await this.persistence.find(AI_CONFIG_RELEASES_SLUG, {
        releaseID: { equals: releaseID },
      })
    ).docs[0];
  }

  async requireRelease(releaseID: string): Promise<AIDocument> {
    const release = await this.getRelease(releaseID);
    if (!release) {
      throw new EndpointError(
        "NOT_FOUND",
        "AI configuration release was not found.",
        404,
      );
    }
    return release;
  }

  async nextReleaseVersion(): Promise<number> {
    const latest = (
      await this.persistence.find(
        AI_CONFIG_RELEASES_SLUG,
        {},
        { sort: "-version" },
      )
    ).docs[0];
    const version = latest ? Number(latest.version) : 0;
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new Error("Stored AI configuration release version is invalid.");
    }
    return version + 1;
  }

  async createRelease(
    release: AIConfigRelease,
    actorID: number | string,
  ): Promise<AIDocument> {
    return await this.persistence.create(AI_CONFIG_RELEASES_SLUG, {
      artifacts: release.artifacts,
      createdBy: actorID,
      manifestHash: release.manifestHash,
      releaseID: release.id,
      releaseKey: `installation:${release.version}`,
      releasedAt: release.createdAt,
      schemaVersion: release.schemaVersion,
      sourceDraftID: release.sourceDraftID,
      sourceDraftRevision: release.sourceDraftRevision,
      ...(release.systemCompatibility.maximumRelease === undefined
        ? {}
        : {
            systemMaximumRelease: release.systemCompatibility.maximumRelease,
          }),
      systemMinimumRelease: release.systemCompatibility.minimumRelease,
      version: release.version,
    });
  }

  async getActivePointer(): Promise<AIDocument | undefined> {
    return (
      await this.persistence.find(
        ACTIVE_AI_CONFIG_POINTERS_SLUG,
        { pointerKey: { equals: "installation" } },
        { sort: "-version" },
      )
    ).docs[0];
  }

  /** Вставляется только под общим transaction lock; unique version key дополнительно защищает CAS. */
  async createActivePointer(input: {
    action: "activate" | "rollback";
    actorID: number | string;
    pointer: ActiveAIConfigPointer;
  }): Promise<AIDocument> {
    return await this.persistence.create(ACTIVE_AI_CONFIG_POINTERS_SLUG, {
      action: input.action,
      activatedAt: input.pointer.activatedAt,
      activatedBy: input.actorID,
      manifestHash: input.pointer.manifestHash,
      pointerKey: "installation",
      pointerVersionKey: `installation:${input.pointer.version}`,
      releaseID: input.pointer.releaseID,
      version: input.pointer.version,
    });
  }

  async findEvent(idempotencyKey: string): Promise<AIDocument | undefined> {
    return (
      await this.persistence.find(AI_CONFIG_EVENTS_SLUG, {
        idempotencyKey: { equals: idempotencyKey },
      })
    ).docs[0];
  }

  async recordEvent(input: {
    action: AIConfigEventAction;
    actorID: number | string;
    idempotencyKey: string;
    requestHash: string;
    resourceID: string;
    resourceKind: "draft" | "release";
    responseSnapshot: Record<string, unknown>;
    status: "succeeded" | "validation_failed";
  }): Promise<void> {
    await this.persistence.create(AI_CONFIG_EVENTS_SLUG, {
      action: input.action,
      actor: input.actorID,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      resourceID: input.resourceID,
      resourceKind: input.resourceKind,
      responseSnapshot: input.responseSnapshot,
      status: input.status,
    });
  }
}
