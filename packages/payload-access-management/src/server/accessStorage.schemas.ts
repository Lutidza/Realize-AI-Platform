/**
 * @file packages/payload-access-management/src/server/accessStorage.schemas.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет сохранённое состояние credentials и device authorization.
 * @see documentation/architecture/platform-access.md
 */
import { z } from "zod";
import {
  accessScopesSchema,
  userCodeSchema,
} from "../contracts/access.schemas";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const accessCredentialRecordSchema = z.strictObject({
  id: z.uuid(),
  ownerId: z.string().min(1).max(128),
  name: z.string().min(1).max(100),
  kind: z.enum(["personal", "api", "cli"]),
  scopes: accessScopesSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  accessExpiresAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  accessHash: hash,
  refreshHash: hash.nullable(),
});
export const accessDeviceRecordSchema = z.strictObject({
  id: z.uuid(),
  deviceHash: hash,
  userCode: userCodeSchema,
  clientName: z.string().min(1).max(100),
  scopes: accessScopesSchema,
  expiresAt: z.iso.datetime(),
  status: z.enum(["pending", "approved", "denied", "consumed", "cancelled"]),
  ownerId: z.string().min(1).max(128).nullable(),
  credentialId: z.uuid().nullable(),
  interval: z.number().int().min(5).max(60),
  lastPollAt: z.iso.datetime().nullable(),
});
