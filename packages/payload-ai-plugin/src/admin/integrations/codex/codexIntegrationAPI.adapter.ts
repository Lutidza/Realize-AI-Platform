/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/codexIntegrationAPI.adapter.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Передаёт безопасные DTO настроек Codex и серверного входа через ChatGPT.
 */

import type {
  CodexAuthEnvironmentDTO,
  CompleteCodexBrowserLoginInput,
  CodexIntegrationConnectionDTO,
  CodexLoginPendingDTO,
  CodexLoginSessionInput,
  CodexLoginStatusDTO,
  DisconnectIntegrationDTO,
  DisconnectIntegrationInput,
  SaveCodexIntegrationInput,
  StartCodexLoginInput,
  TestCodexIntegrationDTO,
  TestCodexIntegrationInput,
} from "@realize/ai-contracts";
import { requestRealizeAI } from "../../realizeAIAPI";
import { integrationMutationHeaders } from "../integrationMutationHeaders.util";

/** Все операции проходят через authenticated API; browser не получает credential аккаунта. */
export const codexIntegrationAPI = {
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
