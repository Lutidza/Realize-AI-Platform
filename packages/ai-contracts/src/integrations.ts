/**
 * @file packages/ai-contracts/src/integrations.ts
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Задаёт browser-safe контракты каталога интеграций без secret material.
 */

/** Stable provider identifiers with implemented server adapters. */
export type IntegrationProviderID = "github";

/** Groups a growing provider catalog without coupling UI to persistence. */
export type IntegrationCategory = "development";

/** Safe GitHub configuration returned to an authorized Admin browser. */
export type GitHubIntegrationConfigurationDTO = {
  defaultBranch?: string;
  repositorySlug: string;
  repositoryURL: string;
};

/** Shared metadata for one configured provider connection. */
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

/** Discriminated browser projection for the current GitHub adapter. */
export type GitHubIntegrationConnectionDTO = IntegrationConnectionBaseDTO & {
  configuration: GitHubIntegrationConfigurationDTO;
  provider: "github";
};

/** Union extended by each provider-specific safe configuration. */
export type IntegrationConnectionDTO = GitHubIntegrationConnectionDTO;

/** Client-safe provider metadata used to render a scalable catalog. */
export type IntegrationProviderDescriptorDTO = {
  capabilities: string[];
  category: IntegrationCategory;
  description: string;
  id: IntegrationProviderID;
  name: string;
};

/** Aggregate returned by the Admin integrations root view. */
export type IntegrationCatalogDTO = {
  connections: IntegrationConnectionDTO[];
  providers: IntegrationProviderDescriptorDTO[];
  vaultConfigured: boolean;
};

/** Optimistic upsert of the primary GitHub connection. */
export type SaveGitHubIntegrationInput = {
  displayName?: string;
  enabled: boolean;
  expectedRevision: number;
  repositoryURL: string;
  token?: string;
};

/** Draft values optionally used by a non-persisting connection test. */
export type TestGitHubIntegrationInput = {
  repositoryURL?: string;
  token?: string;
};

/** Safe result of one server-side provider connection check. */
export type GitHubIntegrationTestDTO = {
  checkedAt: string;
  defaultBranch?: string;
  message: string;
  repositorySlug: string;
  status: "failed" | "passed";
};

/** Optimistic request to remove one configured connection and its credential. */
export type DisconnectIntegrationInput = {
  expectedRevision: number;
};

/** Explicit disconnect result without returning the removed record. */
export type DisconnectIntegrationDTO = {
  disconnected: true;
  provider: IntegrationProviderID;
};
