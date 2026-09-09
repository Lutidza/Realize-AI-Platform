/**
 * @file packages/codex-adapter/src/CodexProfile.error.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отделяет безопасную ошибку профиля Codex от системных путей и credentials.
 */

/** Сообщение не содержит native auth JSON, cause или пути к серверному профилю. */
export class CodexProfileError extends Error {
  constructor() {
    super("Профиль авторизации Codex недействителен или недоступен.");
    this.name = "CodexProfileError";
  }
}
