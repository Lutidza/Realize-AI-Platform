/**
 * @file .ai/tools/task-workspace/src/auth/validateCredentialBundle.validator.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Сверяет identity и сроки CLI credential после обмена и чтения keyring.
 * @see documentation/architecture/platform-access.md
 */
import { credentialBundleSchema } from "@realize/payload-access-management/contracts";
import { fail } from "../Workspace.error.mjs";

/** @param {unknown} value @param {import('@realize/payload-access-management/contracts').CredentialBundle} [previous] */
export function validateCredentialBundle(value, previous) {
  const parsed = credentialBundleSchema.safeParse(value);
  if (!parsed.success) fail("auth_credential_invalid");
  const bundle = parsed.data;
  if (
    bundle.token.kind !== "cli" ||
    bundle.token.status !== "active" ||
    bundle.actor.id !== bundle.token.ownerId ||
    bundle.accessToken.split(".")[1] !== bundle.token.id ||
    bundle.refreshToken.split(".")[1] !== bundle.token.id ||
    bundle.token.prefix !== `rza.${bundle.token.id}` ||
    bundle.expiresAt !== bundle.token.expiresAt ||
    bundle.accessExpiresAt !== bundle.token.accessExpiresAt ||
    Date.parse(bundle.accessExpiresAt) > Date.parse(bundle.expiresAt) ||
    (previous &&
      (bundle.token.id !== previous.token.id ||
        bundle.actor.id !== previous.actor.id ||
        bundle.expiresAt !== previous.expiresAt ||
        bundle.refreshToken === previous.refreshToken))
  )
    fail(
      "auth_credential_invalid",
      "Identity подключения не соответствует ожидаемой.",
    );
  return bundle;
}
