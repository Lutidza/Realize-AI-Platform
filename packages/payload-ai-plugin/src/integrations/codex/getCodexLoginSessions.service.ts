/**
 * @file packages/payload-ai-plugin/src/integrations/codex/getCodexLoginSessions.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Сохраняет ограниченный реестр входов между запросами и обновлениями модулей сервера.
 */

import { CodexLoginSessionService } from "./CodexLoginSession.service";

export const getCodexLoginSessions = (): CodexLoginSessionService => {
  const host = globalThis as typeof globalThis & {
    realizeCodexLoginSessions?: CodexLoginSessionService;
  };
  return (host.realizeCodexLoginSessions ??= new CodexLoginSessionService());
};
