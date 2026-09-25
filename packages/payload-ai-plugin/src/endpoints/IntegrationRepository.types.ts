/**
 * @file packages/payload-ai-plugin/src/endpoints/IntegrationRepository.types.ts
 * @version 1.2.0
 * @date 2026-09-23
 * @description Задаёт внутренние контракты persistence общих подключений интеграций.
 */

import type {
  CodexIntegrationConfigurationDTO,
  GitHubIntegrationConfigurationDTO,
  IntegrationCategory,
  IntegrationProviderID,
} from "@realize/ai-contracts";
import type { AIDocument } from "./repository";
import type { McpServerConfiguration } from "../../../ai-contracts/src/McpServer.types";
import type { IntegrationEventAction } from "../../../ai-contracts/src/IntegrationEvent.types";

export type IntegrationFindResult = { docs: AIDocument[]; totalDocs: number };
export type IntegrationLocalAPI = {
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
  find: (args: Record<string, unknown>) => Promise<IntegrationFindResult>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
};

/** Запись проходит optimistic revision и использует прежнюю общую collection. */
export type SaveIntegrationRecordInput = {
  actorID: number | string;
  category: IntegrationCategory;
  configuration:
    | GitHubIntegrationConfigurationDTO
    | CodexIntegrationConfigurationDTO
    | McpServerConfiguration;
  connectionKey: string;
  credentialEnvelope?: string | null;
  credentialUpdatedAt?: string | null;
  displayName: string;
  enabled: boolean;
  existing?: AIDocument;
  lastTestStatus: "failed" | "never" | "passed";
  provider: IntegrationProviderID;
  revision: number;
};

/** Прежний GitHub entrypoint сохраняет совместимость внутреннего consumer. */
export type SaveGitHubRecordInput = Omit<
  SaveIntegrationRecordInput,
  "category" | "connectionKey" | "configuration" | "provider"
> & { configuration: GitHubIntegrationConfigurationDTO };

/** Метаданные проверки не изменяют выбранную revision и credential. */
export type RecordIntegrationTestInput = {
  connection: AIDocument;
  errorCode?: string;
  status: "failed" | "passed";
  testedAt: string;
};

export type RecordGitHubTestInput = RecordIntegrationTestInput & {
  defaultBranch?: string;
};

/** Запись безопасного audit; отсутствие provider сохраняет прежний GitHub entrypoint. */
export type RecordIntegrationEventInput = {
  action: IntegrationEventAction;
  actorID: number | string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  provider?: IntegrationProviderID;
  connectionKey?: string;
  status: "failed" | "passed";
  summary: string;
};
