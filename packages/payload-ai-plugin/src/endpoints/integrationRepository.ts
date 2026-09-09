/**
 * @file packages/payload-ai-plugin/src/endpoints/integrationRepository.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Сохраняет настройки интеграций и события без раскрытия секретов через Payload API.
 */

import type { Payload, PayloadRequest } from "payload";
import type { GitHubIntegrationConfigurationDTO } from "@realize/ai-contracts";

import { INTEGRATIONS_SLUG, INTEGRATION_EVENTS_SLUG } from "../constants";
import { PRIMARY_GITHUB_CONNECTION_KEY } from "../integrations/providers";
import { EndpointError } from "./http";
import type { AIDocument } from "./repository";

type FindResult = { docs: AIDocument[]; totalDocs: number };
type UntypedLocalAPI = {
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
  find: (args: Record<string, unknown>) => Promise<FindResult>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
};

const revisionConflict = (): EndpointError =>
  new EndpointError(
    "CONFLICT",
    "Integration settings changed. Reload before continuing.",
    409,
  );

const oneDocument = (value: unknown): AIDocument => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("id" in value) ||
    (typeof value.id !== "number" && typeof value.id !== "string")
  ) {
    throw revisionConflict();
  }
  return value as AIDocument;
};

const oneBulkDocument = (result: unknown): AIDocument => {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw revisionConflict();
  }
  const bulk = result as Record<string, unknown>;
  if (
    !Array.isArray(bulk.docs) ||
    !Array.isArray(bulk.errors) ||
    bulk.errors.length ||
    bulk.docs.length !== 1
  ) {
    throw revisionConflict();
  }
  return oneDocument(bulk.docs[0]);
};

/** Narrow Local API repository; collection access remains denied to generic CRUD. */
export class IntegrationRepository {
  private readonly api: UntypedLocalAPI;
  private readonly defaultIDType: "number" | "text";

  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
    this.defaultIDType = payload.db.defaultIDType;
  }

  async getPrimaryGitHub(): Promise<AIDocument | undefined> {
    const result = await this.find(INTEGRATIONS_SLUG, {
      connectionKey: { equals: PRIMARY_GITHUB_CONNECTION_KEY },
    });
    return result.docs[0];
  }

  async saveGitHub(input: {
    actorID: number | string;
    configuration: GitHubIntegrationConfigurationDTO;
    credentialEnvelope?: string;
    credentialUpdatedAt?: string;
    displayName: string;
    enabled: boolean;
    existing?: AIDocument;
    lastTestStatus: "failed" | "never" | "passed";
    revision: number;
  }): Promise<AIDocument> {
    const data = {
      category: "development",
      configuration: input.configuration,
      connectionKey: PRIMARY_GITHUB_CONNECTION_KEY,
      credentialEnvelope: input.credentialEnvelope,
      credentialUpdatedAt: input.credentialUpdatedAt,
      displayName: input.displayName,
      enabled: input.enabled,
      lastErrorCode: undefined,
      lastTestStatus: input.lastTestStatus,
      provider: "github",
      revision: input.revision,
      updatedBy: input.actorID,
    };
    if (!input.existing) {
      return await this.api.create({
        collection: INTEGRATIONS_SLUG,
        data: { ...data, createdBy: input.actorID },
        overrideAccess: true,
        req: this.req,
      });
    }
    const previousRevision = input.revision - 1;
    return oneBulkDocument(
      await this.api.update({
        collection: INTEGRATIONS_SLUG,
        data,
        limit: 1,
        overrideAccess: true,
        req: this.req,
        where: {
          and: [
            { id: { equals: this.documentID(input.existing.id) } },
            { revision: { equals: previousRevision } },
          ],
        },
      }),
    );
  }

  async recordGitHubTest(input: {
    connection: AIDocument;
    defaultBranch?: string;
    errorCode?: string;
    status: "failed" | "passed";
    testedAt: string;
  }): Promise<AIDocument> {
    const configuration =
      input.connection.configuration &&
      typeof input.connection.configuration === "object" &&
      !Array.isArray(input.connection.configuration)
        ? { ...(input.connection.configuration as Record<string, unknown>) }
        : {};
    if (input.defaultBranch) configuration.defaultBranch = input.defaultBranch;
    return oneDocument(
      await this.api.update({
        collection: INTEGRATIONS_SLUG,
        data: {
          configuration,
          lastErrorCode: input.errorCode,
          lastTestStatus: input.status,
          lastTestedAt: input.testedAt,
        },
        id: this.documentID(input.connection.id),
        overrideAccess: true,
        req: this.req,
      }),
    );
  }

  async disconnect(
    connection: AIDocument,
    expectedRevision: number,
  ): Promise<void> {
    oneBulkDocument(
      await this.api.delete({
        collection: INTEGRATIONS_SLUG,
        overrideAccess: true,
        req: this.req,
        where: {
          and: [
            { id: { equals: this.documentID(connection.id) } },
            { revision: { equals: expectedRevision } },
          ],
        },
      }),
    );
  }

  async findEvent(idempotencyKey: string): Promise<AIDocument | undefined> {
    const result = await this.find(INTEGRATION_EVENTS_SLUG, {
      idempotencyKey: { equals: idempotencyKey },
    });
    return result.docs[0];
  }

  async recordEvent(input: {
    action: "disconnected" | "saved" | "tested";
    actorID: number | string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
    status: "failed" | "passed";
    summary: string;
  }): Promise<void> {
    await this.api.create({
      collection: INTEGRATION_EVENTS_SLUG,
      data: {
        action: input.action,
        actor: input.actorID,
        connectionKey: PRIMARY_GITHUB_CONNECTION_KEY,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata || {},
        provider: "github",
        status: input.status,
        summary: input.summary,
      },
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
    collection: string,
    where: Record<string, unknown>,
  ): Promise<FindResult> {
    return await this.api.find({
      collection,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req: this.req,
      where,
    });
  }
}
