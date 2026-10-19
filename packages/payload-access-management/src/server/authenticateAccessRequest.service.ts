/**
 * @file packages/payload-access-management/src/server/authenticateAccessRequest.service.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Аутентифицирует scoped bearer только внутри вызвавшего endpoint и повторно проверяет отзыв.
 * @see documentation/architecture/platform-access.md
 */
import type { PayloadRequest } from "payload";
import type { AccessManagementOptions } from "../AccessManagementOptions.types";
import type { AccessScope, AccessSessionDto } from "../contracts/Access.types";
import { resolveAccessManagementOptions } from "../accessManagementOptions.config";
import { ACCESS_CREDENTIALS_SLUG } from "../accessManagement.constants";
import { AccessStoreRepository } from "./AccessStore.repository";
import { accessCredentialRecordSchema } from "./accessStorage.schemas";
import {
  accessForbidden,
  accessUnauthenticated,
} from "./AccessManagement.error";
import { equalAccessHash, readAccessSecret } from "./accessSecret.adapter";
import { readAccessActor } from "./readAccessActor.service";
import { mapAccessToken } from "./mapAccess.mapper";
import {
  lockAccessScope,
  withAccessTransaction,
} from "./withAccessTransaction.repository";
/** null означает прежний JWT/cookie путь; rza/rzr/rzd никогда не откатываются к cookie при ошибке. */
export async function authenticateAccessRequest(
  req: PayloadRequest,
  input: AccessManagementOptions,
  scope: AccessScope,
): Promise<AccessSessionDto | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!/^(?:\S+\s+)?(?:rza|rzr|rzd)(?:\.|$)/i.test(header)) return null;
  req.user = null;
  const secret = readAccessSecret(
    /^Bearer /i.test(header) ? header.slice(7) : null,
    "access",
  );
  const authenticate = async () => {
    const store = new AccessStoreRepository(req);
    const row = await store.one(ACCESS_CREDENTIALS_SLUG, {
      credentialId: { equals: secret.id },
    });
    if (!row) throw accessUnauthenticated();
    const record = accessCredentialRecordSchema.parse(row.record);
    const now = Date.now();
    if (
      !equalAccessHash(secret.value, record.accessHash) ||
      record.revokedAt ||
      Date.parse(record.expiresAt) <= now ||
      Date.parse(record.accessExpiresAt) <= now
    )
      throw accessUnauthenticated();
    if (!record.scopes.includes(scope)) throw accessForbidden();
    const actor = await readAccessActor(
      req,
      resolveAccessManagementOptions(input),
      record.ownerId,
    );
    // Heartbeat меняет record только под тем же lock, что refresh/revoke.
    if (!record.lastUsedAt || now - Date.parse(record.lastUsedAt) >= 60000) {
      record.lastUsedAt = new Date(now).toISOString();
      await store.update(ACCESS_CREDENTIALS_SLUG, row.id, { record });
    }
    return { actor, token: mapAccessToken(record, now) };
  };
  if ((await req.transactionID) != null) {
    await lockAccessScope(req, `credential:${secret.id}`);
    return authenticate();
  }
  return withAccessTransaction(req, [`credential:${secret.id}`], authenticate);
}
