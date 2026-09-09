/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/codexAuthOptions.config.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт названия и назначение способов подключения GPT — Codex.
 */

import type { CodexAuthOption } from "./CodexAuthOption.types";

export const codexAuthOptions: readonly CodexAuthOption[] = [
  {
    authMode: "chatgpt",
    loginMethod: "browser",
    label: "Вход через браузер",
    description: "Аккаунт ChatGPT · подтверждение на сайте OpenAI",
  },
  {
    authMode: "chatgpt",
    loginMethod: "deviceCode",
    label: "Код устройства",
    description: "Аккаунт ChatGPT · удобно для удалённого сервера",
  },
  {
    authMode: "apiKey",
    label: "OpenAI API key",
    description: "Отдельная оплата API по использованию",
  },
  {
    authMode: "accessToken",
    label: "Токен рабочего пространства",
    description: "Codex access token · ChatGPT Business / Enterprise",
  },
  {
    authMode: "workloadIdentity",
    label: "Серверная идентификация",
    description: "Workload identity · автоматизация и CI · beta",
  },
];
