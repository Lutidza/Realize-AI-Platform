/**
 * @file packages/payload-access-management/src/server/AccessThrottle.service.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Ограничивает device start и поиск короткого кода общим состоянием PostgreSQL.
 * @see documentation/architecture/platform-access.md
 */
import type { PayloadRequest } from "payload";
import { ACCESS_LIMITS_SLUG } from "../accessManagement.constants";
import { AccessStoreRepository } from "./AccessStore.repository";
import { withAccessTransaction } from "./withAccessTransaction.repository";
/** Caller держит lock bucket: никакой доверенной client IP или растущей таблицы случайных ключей. */
export async function consumeAccessBudget(
  req: PayloadRequest,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const store = new AccessStoreRepository(req);
  const row = await store.one(ACCESS_LIMITS_SLUG, {
    bucket: { equals: bucket },
  });
  const now = Date.now();
  const start =
    row && typeof row.windowStart === "string"
      ? Date.parse(row.windowStart)
      : 0;
  const count =
    row && Number.isSafeInteger(row.count) && now - start < windowSeconds * 1000
      ? Number(row.count)
      : 0;
  const data = {
    bucket,
    windowStart: new Date(count ? start : now).toISOString(),
    count: Math.min(count + 1, limit + 1),
  };
  if (row) await store.update(ACCESS_LIMITS_SLUG, row.id, data);
  else await store.create(ACCESS_LIMITS_SLUG, data);
  return count < limit;
}
export async function allowAccessCodeLookup(
  req: PayloadRequest,
  actorId: string,
): Promise<boolean> {
  const bucket = `device-lookup:${actorId}`;
  return withAccessTransaction(req, [bucket], () =>
    consumeAccessBudget(req, bucket, 20, 60),
  );
}
