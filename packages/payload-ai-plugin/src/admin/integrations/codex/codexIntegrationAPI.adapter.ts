/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/codexIntegrationAPI.adapter.ts
 * @version 1.5.0
 * @date 2026-09-30
 * @description Передаёт безопасные DTO настроек Codex и серверного входа через ChatGPT.
 */

import type {
  CodexAgentDiagnosticsDTO,
  CodexModelCatalogDTO,
  CodexAuthEnvironmentDTO,
  CompleteCodexBrowserLoginInput,
  CodexIntegrationConnectionDTO,
  CodexLoginPendingDTO,
  CodexLoginSessionInput,
  CodexLoginStatusDTO,
  DisconnectIntegrationDTO,
  DisconnectIntegrationInput,
  SaveCodexIntegrationInput,
  SaveCodexAgentSettingsInput,
  SaveCodexChatSettingsInput,
  StartCodexLoginInput,
  TestCodexIntegrationDTO,
  TestCodexIntegrationInput,
} from "@realize/ai-contracts";
import { requestRealizeAI } from "../../realizeAIAPI";
import { integrationMutationHeaders } from "../integrationMutationHeaders.util";

/** Все операции проходят через authenticated API; browser не получает credential аккаунта. */
export const codexIntegrationAPI = {
  models: async (signal: AbortSignal) =>
    requestRealizeAI<CodexModelCatalogDTO>("/integrations/codex/models", {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
    }),
  diagnostics: async (signal: AbortSignal) =>
    requestRealizeAI<CodexAgentDiagnosticsDTO>(
      "/integrations/codex/diagnostics",
      {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      },
    ),
  saveAgentSettings: async (
    input: SaveCodexAgentSettingsInput,
    idempotencyKey: string,
  ) =>
    requestRealizeAI<CodexIntegrationConnectionDTO>(
      "/integrations/codex/agent-settings",
      {
        body: JSON.stringify(input),
        headers: { "Idempotency-Key": idempotencyKey },
        method: "PUT",
        signal: AbortSignal.timeout(35000),
      },
    ),
  saveChatSettings: async (input: SaveCodexChatSettingsInput) =>
    requestRealizeAI<CodexIntegrationConnectionDTO>(
      "/integrations/codex/chat-settings",
      {
        body: JSON.stringify(input),
        headers: integrationMutationHeaders(),
        method: "PUT",
      },
    ),
  environment: async (signal: AbortSignal) =>
    requestRealizeAI<CodexAuthEnvironmentDTO>(
      "/integrations/codex/auth/environment",
      {
        method: "GET",
        cache: "no-store",
        signal,
      },
    ),
  completeLogin: async (input: CompleteCodexBrowserLoginInput) =>
    requestRealizeAI<CodexLoginStatusDTO>(
      "/integrations/codex/login/complete",
      {
        body: JSON.stringify(input),
        headers: integrationMutationHeaders(),
        method: "POST",
      },
    ),
  save: async (input: SaveCodexIntegrationInput) =>
    requestRealizeAI<CodexIntegrationConnectionDTO>("/integrations/codex", {
      body: JSON.stringify(input),
      headers: integrationMutationHeaders(),
      method: "PUT",
    }),
  disconnect: async (input: DisconnectIntegrationInput) =>
    requestRealizeAI<DisconnectIntegrationDTO>("/integrations/codex", {
      body: JSON.stringify(input),
      headers: integrationMutationHeaders(),
      method: "DELETE",
    }),
  test: async (input: TestCodexIntegrationInput) =>
    requestRealizeAI<TestCodexIntegrationDTO>("/integrations/codex/test", {
      body: JSON.stringify(input),
      headers: integrationMutationHeaders(),
      method: "POST",
    }),
  startLogin: async (input: StartCodexLoginInput) =>
    requestRealizeAI<CodexLoginPendingDTO>("/integrations/codex/login/start", {
      body: JSON.stringify(input),
      headers: integrationMutationHeaders(),
      method: "POST",
    }),
  loginStatus: async (input: CodexLoginSessionInput, signal: AbortSignal) =>
    requestRealizeAI<CodexLoginStatusDTO>("/integrations/codex/login/status", {
      body: JSON.stringify(input),
      headers: integrationMutationHeaders(),
      method: "POST",
      signal,
    }),
  cancelLogin: async (input: CodexLoginSessionInput) => {
    await requestRealizeAI<unknown>("/integrations/codex/login/cancel", {
      body: JSON.stringify(input),
      headers: integrationMutationHeaders(),
      method: "POST",
    });
  },
};
