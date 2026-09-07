/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigPersistence.ts
 * @version 2026-09-01
 * @description Адаптирует минимальный Payload Local API для config repository.
 * @docref Realize AI Commerce v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { Payload, PayloadRequest } from "payload";

import { EndpointError } from "./http";
import type { AIDocument } from "./repository";

type FindResult = { docs: AIDocument[]; totalDocs: number };
type UntypedLocalAPI = {
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  find: (args: Record<string, unknown>) => Promise<FindResult>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
};

const revisionConflict = (): EndpointError =>
  new EndpointError(
    "CONFLICT",
    "AI configuration draft changed. Reload before continuing.",
    409,
  );

const oneBulkDocument = (result: unknown): AIDocument => {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw revisionConflict();
  }
  const bulk = result as Record<string, unknown>;
  if (
    !Array.isArray(bulk.docs) ||
    bulk.docs.length !== 1 ||
    (Array.isArray(bulk.errors) && bulk.errors.length > 0)
  ) {
    throw revisionConflict();
  }
  return bulk.docs[0] as AIDocument;
};

/** Executes only server-authorized CRUD against hidden config collections. */
export class AIConfigPersistence {
  private readonly api: UntypedLocalAPI;

  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
  }

  async create(
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

  async find(
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

  async updateDraft(input: {
    collection: string;
    data: Record<string, unknown>;
    draftID: string;
    expectedRevision: number;
    expectedState?: string;
  }): Promise<AIDocument> {
    const conditions: Record<string, unknown>[] = [
      { draftID: { equals: input.draftID } },
      { revision: { equals: input.expectedRevision } },
    ];
    if (input.expectedState) {
      conditions.push({ state: { equals: input.expectedState } });
    }
    return oneBulkDocument(
      await this.api.update({
        collection: input.collection,
        data: input.data,
        limit: 1,
        overrideAccess: true,
        req: this.req,
        where: { and: conditions },
      }),
    );
  }
}
