/**
 * @file packages/payload-ai-plugin/src/integrations/codex/testCodexCredential.service.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Проверяет доступ Codex по сохранённой авторизации без платного запроса к модели.
 */

import type { TestCodexIntegrationDTO } from "@realize/ai-contracts";
import { CodexAccountClient } from "@realize/codex-adapter/account";
import { validateCodexCredential } from "@realize/codex-adapter/profile";
import type { CodexCredentialCheckInput } from "./CodexCredentialCheck.types";

export const testCodexCredential = async (
  input: CodexCredentialCheckInput,
): Promise<TestCodexIntegrationDTO> => {
  const checkedAt = new Date().toISOString();
  let client: CodexAccountClient | undefined;
  try {
    if (input.authJSON !== undefined)
      validateCodexCredential(input.authJSON, input.authMode);
    if (input.authMode === "apiKey") {
      if (!input.authJSON) throw new Error("api_credential_required");
      const credential = JSON.parse(input.authJSON) as {
        OPENAI_API_KEY: string;
      };
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${credential.OPENAI_API_KEY}` },
        redirect: "error",
        signal: AbortSignal.any([
          AbortSignal.timeout(15_000),
          ...(input.profile?.signal ? [input.profile.signal] : []),
        ]),
        cache: "no-store",
      });
      await response.body?.cancel();
      return {
        checkedAt,
        status: response.ok ? "passed" : "failed",
        message: response.ok
          ? "API key принят. Список моделей доступен; баланс и выполнение платных запросов не проверялись."
          : "Не удалось подтвердить API key. Проверьте срок действия ключа и разрешение на чтение моделей.",
      };
    }
    if (!input.profile) throw new Error("account_profile_lease_required");
    client = await CodexAccountClient.connect({
      ...input.profile,
      codexBinary: process.env.REALIZE_CODEX_BINARY || undefined,
    });
    const account = await client.readAccount();
    if (account?.type !== "chatgpt") throw new Error("account_required");
    await client.checkAccountAccess();
    return {
      checkedAt,
      status: "passed",
      message:
        input.authMode === "workloadIdentity"
          ? "Workload identity принята, данные лимитов Codex доступны. Запрос к модели не выполнялся."
          : input.authMode === "accessToken"
            ? "Access token принят, данные лимитов Codex доступны. Запрос к модели не выполнялся."
            : "Аккаунт ChatGPT подключён, данные лимитов Codex доступны. Запрос к модели не выполнялся.",
      ...(account.email ? { accountEmail: account.email } : {}),
      planType: account.planType,
    };
  } catch {
    return {
      checkedAt,
      status: "failed",
      message:
        "Не удалось проверить доступ Codex. Проверьте подключение к сети и повторите вход.",
    };
  } finally {
    await client?.close();
  }
};
