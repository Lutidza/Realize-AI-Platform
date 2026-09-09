/**
 * @file packages/codex-adapter/src/validateCodexCredential.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Выбирает валидатор сохранённого credential по явному способу авторизации.
 */

import {
  createCodexAccessTokenCredential,
  readCodexAccessTokenCredential,
} from "./CodexAccessTokenCredential.adapter";
import { CodexProfileError } from "./CodexProfile.error";
import type { CodexAuthMode } from "./CodexProfile.types";
import { validateNativeCodexAuth } from "./validateNativeCodexAuth.validator";

/** WIF не имеет сохранённого credential; PAT wrapper не передаётся native auth.json. */
export const validateCodexCredential = (
  credential: string,
  authMode: CodexAuthMode,
): string => {
  if (authMode === "accessToken")
    return createCodexAccessTokenCredential(
      readCodexAccessTokenCredential(credential),
    );
  if (authMode === "workloadIdentity") throw new CodexProfileError();
  return validateNativeCodexAuth(credential, authMode);
};
