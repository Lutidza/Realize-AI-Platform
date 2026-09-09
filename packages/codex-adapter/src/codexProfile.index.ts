/**
 * @file packages/codex-adapter/src/codexProfile.index.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Экспортирует серверные операции профиля Codex без изменения legacy environment.
 */

export {
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
  PrepareCodexProfileInput,
} from "./CodexProfile.types";
