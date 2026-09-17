/**
 * @file packages/codex-adapter/src/codexProfile.index.ts
 * @version 1.2.0
 * @date 2026-09-15
 * @description Экспортирует серверные операции профиля Codex без изменения legacy environment.
 */

export {
  createCodexRunProfile,
  prepareCodexProfile,
  readCodexProfileAuth,
  removeCodexProfileAuth,
} from "./CodexProfile.adapter";
export { validateNativeCodexAuth } from "./validateNativeCodexAuth.validator";
export { validateCodexCredential } from "./validateCodexCredential.validator";
export { createCodexAccessTokenCredential } from "./CodexAccessTokenCredential.adapter";
export { readCodexWorkloadIdentityConfiguration } from "./readCodexWorkloadIdentityConfiguration.config";
export { CodexProfileError } from "./CodexProfile.error";
export type {
  CodexAuthMode,
  CodexRunProfile,
  PrepareCodexProfileInput,
} from "./CodexProfile.types";
