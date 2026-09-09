/**
 * @file packages/payload-ai-plugin/src/admin/integrations/integrationAPI.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Передаёт безопасные DTO каталога и операций GitHub через общий API.
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
import { integrationMutationHeaders } from "./integrationMutationHeaders.util";

/** Загружает безопасный каталог провайдеров и сохранённых подключений. */
export const loadIntegrationCatalog =
  async (): Promise<IntegrationCatalogDTO> =>
    await requestRealizeAI<IntegrationCatalogDTO>("/integrations");

/** Сохраняет GitHub; токен передаётся только на запись и не возвращается. */
export const saveGitHubIntegration = async (
  input: SaveGitHubIntegrationInput,
): Promise<GitHubIntegrationConnectionDTO> =>
  await requestRealizeAI<GitHubIntegrationConnectionDTO>(
    "/integrations/github",
    {
      body: JSON.stringify(input),
      headers: integrationMutationHeaders(),
      method: "PUT",
    },
  );

/** Проверяет черновые или сохранённые параметры GitHub. */
export const testGitHubIntegration = async (
  input: TestGitHubIntegrationInput,
): Promise<GitHubIntegrationTestDTO> =>
  await requestRealizeAI<GitHubIntegrationTestDTO>(
    "/integrations/github/test",
    {
      body: JSON.stringify(input),
      headers: integrationMutationHeaders(),
      method: "POST",
    },
  );

/** Удаляет указанную версию подключения и её защищённые данные доступа. */
export const disconnectGitHubIntegration = async (
  input: DisconnectIntegrationInput,
): Promise<DisconnectIntegrationDTO> =>
  await requestRealizeAI<DisconnectIntegrationDTO>("/integrations/github", {
    body: JSON.stringify(input),
    headers: integrationMutationHeaders(),
    method: "DELETE",
  });
