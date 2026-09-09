/**
 * @file packages/payload-ai-plugin/src/endpoints/integrationRepository.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Сохраняет настройки интеграций и события без раскрытия секретов через Payload API.
 */

import type { Payload, PayloadRequest } from "payload";

import { INTEGRATIONS_SLUG, INTEGRATION_EVENTS_SLUG } from "../constants";
import { PRIMARY_GITHUB_CONNECTION_KEY } from "../integrations/providers";
import { EndpointError } from "./http";
import type { AIDocument } from "./repository";
import type {
  IntegrationFindResult,
  IntegrationLocalAPI,
  SaveGitHubRecordInput,
  SaveIntegrationRecordInput,
  RecordGitHubTestInput,
  RecordIntegrationTestInput,
  RecordIntegrationEventInput,
} from "./IntegrationRepository.types";

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

/** Общий Local API repository; внешнее управление остаётся в разрешённых endpoints. */
export class IntegrationRepository {
  private readonly api: IntegrationLocalAPI;
  private readonly defaultIDType: "number" | "text";

  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as IntegrationLocalAPI;
    this.defaultIDType = payload.db.defaultIDType;
  }

  async getPrimaryGitHub(): Promise<AIDocument | undefined> {
    return this.getByConnectionKey(PRIMARY_GITHUB_CONNECTION_KEY);
  }

  /** Читает одно подключение по серверному стабильному ключу. */
  async getByConnectionKey(
    connectionKey: string,
  ): Promise<AIDocument | undefined> {
    const result = await this.find(INTEGRATIONS_SLUG, {
      connectionKey: { equals: connectionKey },
    });
    return result.docs[0];
  }

  async saveGitHub(input: SaveGitHubRecordInput): Promise<AIDocument> {
    return this.save({
      ...input,
      category: "development",
      connectionKey: PRIMARY_GITHUB_CONNECTION_KEY,
      provider: "github",
    });
  }

  /** Общая запись использует CAS по предыдущей revision для обоих провайдеров. */
  async save(input: SaveIntegrationRecordInput): Promise<AIDocument> {
    const data = {
      category: input.category,
      configuration: input.configuration,
      connectionKey: input.connectionKey,
      credentialEnvelope: input.credentialEnvelope,
      credentialUpdatedAt: input.credentialUpdatedAt,
      displayName: input.displayName,
      enabled: input.enabled,
      lastErrorCode: undefined,
      lastTestStatus: input.lastTestStatus,
      provider: input.provider,
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

  async recordGitHubTest(input: RecordGitHubTestInput): Promise<AIDocument> {
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

  /** Не присоединяет результат проверки к другой версии или заменённому credential. */
  async recordTest(input: RecordIntegrationTestInput): Promise<void> {
    oneBulkDocument(
      await this.api.update({
        collection: INTEGRATIONS_SLUG,
        data: {
          lastErrorCode: input.errorCode,
          lastTestStatus: input.status,
          lastTestedAt: input.testedAt,
        },
        limit: 1,
        overrideAccess: true,
        req: this.req,
        where: {
          and: [
            { id: { equals: this.documentID(input.connection.id) } },
            { revision: { equals: input.connection.revision } },
            {
              credentialEnvelope: {
                equals: input.connection.credentialEnvelope,
              },
            },
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

  async recordEvent(input: RecordIntegrationEventInput): Promise<void> {
    await this.api.create({
      collection: INTEGRATION_EVENTS_SLUG,
      data: {
        action: input.action,
        actor: input.actorID,
        connectionKey: input.connectionKey ?? PRIMARY_GITHUB_CONNECTION_KEY,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata || {},
        provider: input.provider ?? "github",
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
  ): Promise<IntegrationFindResult> {
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
