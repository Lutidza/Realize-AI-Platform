/**
 * @file packages/codex-adapter/src/CodexProfile.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Задаёт серверный контракт изолированного профиля авторизации Codex.
 */

export type { CodexAuthMode } from "@realize/ai-contracts";
import type { CodexAuthMode } from "@realize/ai-contracts";

/** Native credential остаётся внутри серверного процесса и управляемого каталога. */
export type PrepareCodexProfileInput = {
  home: string;
  authJSON?: string;
  authMode: CodexAuthMode;
  sourceEnvironment?: NodeJS.ProcessEnv;
};
