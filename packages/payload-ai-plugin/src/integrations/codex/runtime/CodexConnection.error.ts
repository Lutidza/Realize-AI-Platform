/**
 * @file packages/payload-ai-plugin/src/integrations/codex/runtime/CodexConnection.error.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Представляет безопасный отказ серверного подключения Codex.
 */

/** Сообщения формируются владельцем runtime без значений DB, пути и credential. */
export class CodexConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexConnectionError";
  }
}
