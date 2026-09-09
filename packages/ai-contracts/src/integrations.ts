/**
 * @file packages/ai-contracts/src/integrations.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Задаёт browser-safe контракты каталога интеграций без secret material.
 */

import type { GitIntegrationTransport } from "./GitIntegrationTransport.types";
import type { GitCommitAuthor } from "./GitCommitAuthor.types";

/** Стабильные идентификаторы провайдеров с реализованными серверными адаптерами. */
export type IntegrationProviderID = "github";

/** Группирует каталог провайдеров без зависимости UI от persistence. */
export type IntegrationCategory = "development";

/** Безопасная конфигурация GitHub для авторизованного Admin browser. */
export type GitHubIntegrationConfigurationDTO = GitIntegrationTransport & {
  commitAuthor?: GitCommitAuthor;
  defaultBranch?: string;
  repositorySlug: string;
  repositoryURL: string;
};

/** Общие метаданные настроенного подключения провайдера. */
export type IntegrationConnectionBaseDTO = {
  connectionKey: string;
  credentialUpdatedAt?: string;
  displayName: string;
  enabled: boolean;
  hasCredential: boolean;
  id: string;
  lastTestedAt?: string;
  lastTestStatus: "failed" | "never" | "passed";
  provider: IntegrationProviderID;
  revision: number;
  updatedAt: string;
};

/** Browser-проекция текущего GitHub-адаптера с явным provider. */
export type GitHubIntegrationConnectionDTO = IntegrationConnectionBaseDTO & {
  configuration: GitHubIntegrationConfigurationDTO;
  provider: "github";
};

/** Объединение безопасных конфигураций поддерживаемых провайдеров. */
export type IntegrationConnectionDTO = GitHubIntegrationConnectionDTO;

/** Безопасные метаданные провайдера для отображения каталога. */
export type IntegrationProviderDescriptorDTO = {
  capabilities: string[];
  category: IntegrationCategory;
  description: string;
  id: IntegrationProviderID;
  name: string;
};

/** Данные корневого раздела интеграций в Admin. */
export type IntegrationCatalogDTO = {
  connections: IntegrationConnectionDTO[];
  providers: IntegrationProviderDescriptorDTO[];
  vaultConfigured: boolean;
};

/** Сохранение основного GitHub-подключения с optimistic revision. */
export type SaveGitHubIntegrationInput = {
  // Отсутствие сохраняет прежнего автора; null явно удаляет настройку.
  commitAuthor?: GitCommitAuthor | null;
  displayName?: string;
  enabled: boolean;
  expectedRevision: number;
  repositoryURL: string;
  token?: string;
  // Отсутствующий transport сохраняет выбор существующей записи при обновлении.
  transport?: GitIntegrationTransport["transport"];
  sshProfileRef?: string;
};

/** Необязательные черновые значения для проверки подключения без сохранения. */
export type TestGitHubIntegrationInput = {
  repositoryURL?: string;
  token?: string;
};

/** Безопасный результат серверной проверки подключения провайдера. */
export type GitHubIntegrationTestDTO = {
  checkedAt: string;
  defaultBranch?: string;
  message: string;
  repositorySlug: string;
  status: "failed" | "passed";
};

/** Удаление подключения и credential с проверкой optimistic revision. */
export type DisconnectIntegrationInput = {
  expectedRevision: number;
};

/** Результат отключения без выдачи удалённой записи. */
export type DisconnectIntegrationDTO = {
  disconnected: true;
  provider: IntegrationProviderID;
};
