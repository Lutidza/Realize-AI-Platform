/**
 * @file services/ai-execution-worker/src/design-workshop/DesignWorkspace.error.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Сообщает ограниченные ошибки materializer без путей хоста и содержимого файлов.
 * @see documentation/specifications/design-workshop.md
 */
import type { DesignWorkspaceErrorCode } from "./DesignWorkspace.types";

export class DesignWorkspaceError extends Error {
  constructor(readonly code: DesignWorkspaceErrorCode) {
    super(`Файловая версия макета недоступна (${code}).`);
    this.name = "DesignWorkspaceError";
  }
}
