/**
 * @file packages/payload-ai-plugin/src/endpoints/integrationMappers.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Преобразует скрытые записи интеграций в явные DTO без секретов.
 */

import type {
  GitHubIntegrationConfigurationDTO,
  GitHubIntegrationConnectionDTO,
  CodexIntegrationConnectionDTO,
  IntegrationConnectionBaseDTO,
  IntegrationProviderID,
} from "@realize/ai-contracts";
import {
  parseCodexIntegrationConfiguration,
  parseGitHubIntegrationConfiguration,
} from "@realize/ai-contracts";

import type { AIDocument } from "./repository";

const requiredString = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !value) {
    throw new Error(`Stored integration ${name} is invalid.`);
  }
  return value;
};

/** Проверяет provider JSON и оставляет только безопасные поля общей конфигурации. */
export const githubConfigurationOf = (
  value: unknown,
): GitHubIntegrationConfigurationDTO =>
  parseGitHubIntegrationConfiguration(value);

/** Общий allowlist исключает credential, закрытый audit и исходный документ. */
const toIntegrationBaseDTO = (
  document: AIDocument,
  provider: IntegrationProviderID,
): IntegrationConnectionBaseDTO => {
  if (document.provider !== provider) {
    throw new Error("Stored integration provider is unsupported.");
  }
  const lastTestStatus = document.lastTestStatus;
  if (
    lastTestStatus !== "failed" &&
    lastTestStatus !== "never" &&
    lastTestStatus !== "passed"
  ) {
    throw new Error("Stored integration test status is invalid.");
  }
  const revision = Number(document.revision);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error("Stored integration revision is invalid.");
  }
  return {
    connectionKey: requiredString(document.connectionKey, "connectionKey"),
    ...(typeof document.credentialUpdatedAt === "string"
      ? { credentialUpdatedAt: document.credentialUpdatedAt }
      : {}),
    displayName: requiredString(document.displayName, "displayName"),
    enabled: document.enabled === true,
    hasCredential:
      typeof document.credentialEnvelope === "string" &&
      document.credentialEnvelope.length > 0,
    id: String(document.id),
    ...(typeof document.lastTestedAt === "string"
      ? { lastTestedAt: document.lastTestedAt }
      : {}),
    lastTestStatus,
    provider,
    revision,
    updatedAt: requiredString(document.updatedAt, "updatedAt"),
  };
};

/** Возвращает только безопасные GitHub-настройки и признак credential. */
export const toGitHubIntegrationDTO = (
  document: AIDocument,
): GitHubIntegrationConnectionDTO => ({
  ...toIntegrationBaseDTO(document, "github"),
  configuration: githubConfigurationOf(document.configuration),
  provider: "github",
});

/** Возвращает только безопасные данные аккаунта Codex без native auth JSON. */
export const toCodexIntegrationDTO = (
  document: AIDocument,
): CodexIntegrationConnectionDTO => ({
  ...toIntegrationBaseDTO(document, "codex"),
  configuration: parseCodexIntegrationConfiguration(document.configuration),
  provider: "codex",
});
