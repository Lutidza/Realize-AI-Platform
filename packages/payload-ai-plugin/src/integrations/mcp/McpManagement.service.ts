/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/McpManagement.service.ts
 * @version 1.2.0
 * @date 2026-09-26
 * @description Координирует атомарные настройки MCP, CAS и durable replay у общего integration owner.
 * @see documentation/specifications/internal-mcp.md
 */
import { randomUUID } from "node:crypto";
import { hashCanonicalJSON } from "@realize/change-engine";
import type {
  CreateMcpServerInput,
  UpdateMcpServerInput,
  McpServerListQuery,
  McpServerListDto,
  McpServerDetailDto,
  McpServerMutationDto,
} from "../../../../ai-contracts/src/McpServer.types";
import type { IntegrationEventAction } from "../../../../ai-contracts/src/IntegrationEvent.types";
import type { McpManagementContext } from "./McpPersistence.types";
import type { AIDocument } from "../../endpoints/repository";
import { EndpointError } from "../../endpoints/http";
import { requireMatchingIntegrationReplay } from "../../endpoints/integrationHandlerSupport";
import { McpRepository } from "./Mcp.repository";
import { mapMcpServerDetail, mapMcpServerSummary } from "./mapMcpServer.mapper";
import {
  readMcpConfiguration,
  validateMcpConfiguration,
} from "./validateMcpConfiguration.validator";
import { withMcpTransaction } from "./withMcpTransaction.service";
import { readMcpHostProfiles } from "./readMcpHostProfiles.config";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../constants";
import type { RealizeAIServerRuntime } from "../../types";
import { McpChatGptCredentials } from "./McpChatGptCredentials.service";

/** Настройки, keys и apply requests используют один instance lock и revision. */
export class McpManagement {
  readonly repository: McpRepository;
  constructor(readonly context: McpManagementContext) {
    this.repository = new McpRepository(context.req);
  }

  async list(query: McpServerListQuery): Promise<McpServerListDto> {
    const and: Record<string, unknown>[] = [];
    if (query.q) and.push({ displayName: { contains: query.q } });
    if (query.serverType)
      and.push({ "configuration.serverType": { equals: query.serverType } });
    if (query.environment)
      and.push({ "configuration.environment": { equals: query.environment } });
    if (query.enabled !== undefined)
      and.push({ enabled: { equals: query.enabled } });
    const result = await this.repository.servers(
      and.length ? { and } : {},
      query.page,
      query.limit,
    );
    const items = await Promise.all(
      result.docs.map(async (record) =>
        mapMcpServerSummary(
          record,
          await this.repository.receipt(String(record.connectionKey).slice(4)),
        ),
      ),
    );
    return {
      items,
      page: query.page,
      limit: query.limit,
      totalDocs: result.totalDocs,
      totalPages: Math.ceil(result.totalDocs / query.limit),
    };
  }

  async detail(serverID: string): Promise<McpServerDetailDto> {
    const record = await this.repository.server(serverID);
    const config = readMcpConfiguration(record.configuration);
    const profile =
      config.serverType === "realize-internal"
        ? readMcpHostProfiles().find(
            (entry) => entry.id === config.hostProfileID,
          )
        : undefined;
    const ready =
      !!profile &&
      /^[A-Za-z0-9_-]{43,}$/.test(process.env[profile.controlTokenEnv] ?? "");
    const req = this.context.req;
    const runtime = req.payload.config.custom?.[
      REALIZE_AI_SERVER_RUNTIME_KEY
    ] as RealizeAIServerRuntime | undefined;
    const workshopAllowed =
      ready &&
      profile?.workshop === true &&
      !!(await runtime?.canManageDesignWorkshop?.({ req }));
    const grants = {
      workshopRead: workshopAllowed,
      workshopWrite: workshopAllowed,
      workshopPreview:
        workshopAllowed &&
        !!(await runtime?.canPreviewDesignWorkshop?.({ req })),
      repositoryRead:
        ready &&
        !!profile?.repositoryRoot &&
        profile.repositoryServerIDs.includes(serverID),
      pagesRead:
        ready &&
        !!profile?.pagesRead &&
        !!runtime &&
        !!(await runtime.canUseChat({ req })) &&
        !!(await runtime.canManageData({ req })),
    };
    return mapMcpServerDetail(
      record,
      await this.repository.clients(serverID),
      await this.repository.receipt(serverID),
      String(this.context.actor.id),
      {
        ready,
        grants,
        tunnelReady:
          !!profile?.tunnelClientPath &&
          ready &&
          new McpChatGptCredentials(req.payload).configured,
      },
    );
  }

  async create(input: CreateMcpServerInput): Promise<McpServerMutationDto> {
    this.validateInput(input);
    if (
      input.configuration.serverType === "realize-internal" &&
      input.configuration.chatgptTunnel
    )
      throw new EndpointError(
        "INVALID_REQUEST",
        "Настройте ChatGPT после создания MCP-сервера.",
        400,
      );
    return this.mutate("create", "mcp_created", input, async () => {
      const serverID = randomUUID();
      await this.repository.integrations.save({
        provider: "mcp",
        category: "ai",
        connectionKey: `mcp:${serverID}`,
        configuration: input.configuration,
        displayName: input.displayName,
        enabled: false,
        revision: 1,
        actorID: this.context.actor.id,
        lastTestStatus: "never",
      });
      return {
        serverID,
        result: { server: await this.detail(serverID), replayed: false },
        summary: "Создан отключённый MCP-сервер.",
      };
    });
  }

  async update(
    serverID: string,
    input: UpdateMcpServerInput,
  ): Promise<McpServerMutationDto> {
    this.validateInput(input);
    return this.mutate(serverID, "mcp_updated", input, async () => {
      const record = await this.requireRevision(
        serverID,
        input.expectedRevision,
      );
      if (
        readMcpConfiguration(record.configuration).serverType !==
        input.configuration.serverType
      )
        throw new EndpointError(
          "INVALID_REQUEST",
          "Тип существующего экземпляра неизменяем.",
          400,
        );
      const previous = readMcpConfiguration(record.configuration);
      const configuration = { ...input.configuration };
      if (
        configuration.serverType === "realize-internal" &&
        previous.serverType === "realize-internal"
      ) {
        // Общая форма не назначает client binding и не удаляет настроенный connector.
        delete configuration.chatgptTunnel;
        if (previous.chatgptTunnel)
          configuration.chatgptTunnel = previous.chatgptTunnel;
      }
      await this.saveRevision(record, {
        configuration,
        displayName: input.displayName,
      });
      return {
        serverID,
        result: { server: await this.detail(serverID), replayed: false },
        summary: "Настройки MCP сохранены; требуется применение.",
      };
    });
  }

  async enabled(
    serverID: string,
    input: { expectedRevision: number; enabled: boolean },
  ): Promise<McpServerMutationDto> {
    return this.mutate(serverID, "mcp_enabled", input, async () => {
      const record = await this.requireRevision(
        serverID,
        input.expectedRevision,
      );
      const detail = await this.detail(serverID);
      if (!detail.actions.enable.allowed)
        throw new EndpointError(
          "FORBIDDEN",
          detail.actions.enable.reason!,
          403,
        );
      await this.saveRevision(record, { enabled: input.enabled });
      return {
        serverID,
        result: { server: await this.detail(serverID), replayed: false },
        summary: input.enabled
          ? "Включение MCP сохранено; требуется применение."
          : "MCP отключён; новые вызовы запрещены.",
      };
    });
  }

  async apply(serverID: string, expectedRevision: number) {
    return this.mutate(
      serverID,
      "mcp_apply_requested",
      { expectedRevision },
      async () => {
        await this.requireRevision(serverID, expectedRevision);
        const detail = await this.detail(serverID);
        if (!detail.actions.apply.allowed)
          throw new EndpointError(
            "FORBIDDEN",
            detail.actions.apply.reason!,
            403,
          );
        await this.repository.saveReceipt(serverID, {
          requestedRevision: expectedRevision,
          status: "pending",
          reason: "Ожидается подтверждение работающего процесса.",
        });
        return {
          serverID,
          result: { server: await this.detail(serverID), replayed: false },
          summary: "Запрошено применение настроек MCP.",
        };
      },
    );
  }

  async requireRevision(
    serverID: string,
    expected: number,
  ): Promise<AIDocument> {
    const record = await this.repository.server(serverID);
    if (record.revision !== expected)
      throw new EndpointError(
        "CONFLICT",
        "Настройки изменились. Обновите данные, сохранив введённые значения.",
        409,
      );
    return record;
  }

  async saveRevision(
    record: AIDocument,
    changes: Partial<
      Pick<CreateMcpServerInput, "configuration" | "displayName">
    > & {
      enabled?: boolean;
      credentialEnvelope?: string | null;
      credentialUpdatedAt?: string | null;
    } = {},
  ): Promise<void> {
    await this.repository.integrations.save({
      provider: "mcp",
      category: "ai",
      connectionKey: String(record.connectionKey),
      existing: record,
      configuration:
        changes.configuration ?? readMcpConfiguration(record.configuration),
      displayName: changes.displayName ?? String(record.displayName),
      enabled: changes.enabled ?? record.enabled === true,
      revision: Number(record.revision) + 1,
      actorID: this.context.actor.id,
      lastTestStatus: "never",
      credentialEnvelope:
        changes.credentialEnvelope !== undefined
          ? changes.credentialEnvelope
          : typeof record.credentialEnvelope === "string"
            ? record.credentialEnvelope
            : null,
      credentialUpdatedAt:
        changes.credentialUpdatedAt !== undefined
          ? changes.credentialUpdatedAt
          : typeof record.credentialUpdatedAt === "string"
            ? record.credentialUpdatedAt
            : null,
    });
  }

  /** Сохранённый результат не содержит one-time token, raw документ или секрет входного запроса. */
  async replay<T extends { replayed: boolean }>(
    scope: string,
    action: IntegrationEventAction,
    input: unknown,
  ): Promise<T | undefined> {
    const previous = await this.repository.integrations.findEvent(
      this.requestKey(scope, action),
    );
    if (!previous) return;
    const metadata = previous.metadata as { result: T; serverID: string };
    requireMatchingIntegrationReplay(
      previous,
      action,
      this.context.actor.id,
      "mcp",
      hashCanonicalJSON(input),
      `mcp:${scope === "create" ? metadata.serverID : scope}`,
    );
    return { ...metadata.result, replayed: true };
  }

  private requestKey(scope: string, action: IntegrationEventAction): string {
    return `mcp:${hashCanonicalJSON([String(this.context.actor.id), scope, action, this.context.requestKey])}`;
  }

  async mutate<T extends { replayed: boolean }>(
    scope: string,
    action: IntegrationEventAction,
    input: unknown,
    work: () => Promise<{
      serverID: string;
      result: T;
      summary: string;
      storedResult?: T;
      status?: "passed" | "failed";
    }>,
  ): Promise<T> {
    const requestHash = hashCanonicalJSON(input);
    const key = this.requestKey(scope, action);
    return withMcpTransaction(this.context.req, scope, async () => {
      const replayed = await this.replay<T>(scope, action, input);
      if (replayed) return replayed;
      const completed = await work();
      await this.repository.integrations.recordEvent({
        provider: "mcp",
        connectionKey: `mcp:${completed.serverID}`,
        action,
        actorID: this.context.actor.id,
        idempotencyKey: key,
        summary: completed.summary,
        status: completed.status ?? "passed",
        metadata: {
          requestHash,
          serverID: completed.serverID,
          result: completed.storedResult ?? completed.result,
        },
      });
      return completed.result;
    });
  }

  private validateInput(input: CreateMcpServerInput): void {
    validateMcpConfiguration(input.configuration);
    if (input.credential !== undefined)
      throw new EndpointError(
        "INVALID_REQUEST",
        "Этот adapter не использует исходящие credentials.",
        400,
      );
  }
}
