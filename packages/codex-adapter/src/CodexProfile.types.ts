/**
 * @file packages/codex-adapter/src/CodexProfile.types.ts
 * @version 1.2.0
 * @date 2026-09-15
 * @description Задаёт серверный контракт изолированного профиля авторизации Codex.
 */

export type { CodexAuthMode } from "@realize/ai-contracts";
import type { CodexAuthMode } from "@realize/ai-contracts";

/** Собственный каталог одного запуска; remove вызывается только после закрытия процесса. */
export type CodexRunProfile = {
  home: string;
  remove: () => Promise<void>;
};

/** Native credential остаётся внутри серверного процесса и управляемого каталога. */
export type PrepareCodexProfileInput = {
  home: string;
  authJSON?: string;
  authMode: CodexAuthMode;
  sourceEnvironment?: NodeJS.ProcessEnv;
};
