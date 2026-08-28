/**
 * @file packages/payload-ai-plugin/src/endpoints/integrationMappers.ts
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Maps hidden integration documents to explicit browser-safe DTOs.
 */

import type {
  GitHubIntegrationConfigurationDTO,
  GitHubIntegrationConnectionDTO,
} from "@realize/ai-contracts";

import type { AIDocument } from "./repository";

const requiredString = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !value) {
    throw new Error(`Stored integration ${name} is invalid.`);
  }
  return value;
};

/** Narrows provider-specific JSON without exposing unknown stored keys. */
export const githubConfigurationOf = (
  value: unknown,
): GitHubIntegrationConfigurationDTO => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stored GitHub configuration is invalid.");
  }
  const configuration = value as Record<string, unknown>;
  const defaultBranch =
    typeof configuration.defaultBranch === "string" &&
    configuration.defaultBranch
      ? configuration.defaultBranch
      : undefined;
  return {
    ...(defaultBranch ? { defaultBranch } : {}),
    repositorySlug: requiredString(
      configuration.repositorySlug,
      "repositorySlug",
    ),
    repositoryURL: requiredString(configuration.repositoryURL, "repositoryURL"),
  };
};

/** Returns only safe GitHub metadata and a credential-presence marker. */
export const toGitHubIntegrationDTO = (
  document: AIDocument,
): GitHubIntegrationConnectionDTO => {
  if (document.provider !== "github") {
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
    configuration: githubConfigurationOf(document.configuration),
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
    provider: "github",
    revision,
    updatedAt: requiredString(document.updatedAt, "updatedAt"),
  };
};
