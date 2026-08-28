/**
 * @file packages/payload-ai-plugin/src/admin/integrations/integrationAPI.ts
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Owns browser transport for redacted integration DTO endpoints.
 */

import type {
  DisconnectIntegrationDTO,
  DisconnectIntegrationInput,
  GitHubIntegrationConnectionDTO,
  GitHubIntegrationTestDTO,
  IntegrationCatalogDTO,
  SaveGitHubIntegrationInput,
  TestGitHubIntegrationInput,
} from "@realize/ai-contracts";

import { requestRealizeAI } from "../realizeAIAPI";

const mutationHeaders = (): HeadersInit => ({
  "Idempotency-Key": `integration:${crypto.randomUUID()}`,
});

/** Loads the safe provider catalog and configured connections. */
export const loadIntegrationCatalog =
  async (): Promise<IntegrationCatalogDTO> =>
    await requestRealizeAI<IntegrationCatalogDTO>("/integrations");

/** Saves GitHub settings; token is accepted write-only and never returned. */
export const saveGitHubIntegration = async (
  input: SaveGitHubIntegrationInput,
): Promise<GitHubIntegrationConnectionDTO> =>
  await requestRealizeAI<GitHubIntegrationConnectionDTO>(
    "/integrations/github",
    {
      body: JSON.stringify(input),
      headers: mutationHeaders(),
      method: "PUT",
    },
  );

/** Tests either draft or already persisted GitHub connection values. */
export const testGitHubIntegration = async (
  input: TestGitHubIntegrationInput,
): Promise<GitHubIntegrationTestDTO> =>
  await requestRealizeAI<GitHubIntegrationTestDTO>(
    "/integrations/github/test",
    {
      body: JSON.stringify(input),
      headers: mutationHeaders(),
      method: "POST",
    },
  );

/** Removes one exact revision and its encrypted credential. */
export const disconnectGitHubIntegration = async (
  input: DisconnectIntegrationInput,
): Promise<DisconnectIntegrationDTO> =>
  await requestRealizeAI<DisconnectIntegrationDTO>("/integrations/github", {
    body: JSON.stringify(input),
    headers: mutationHeaders(),
    method: "DELETE",
  });
