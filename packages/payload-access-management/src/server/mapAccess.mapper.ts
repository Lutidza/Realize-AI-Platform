/**
 * @file packages/payload-access-management/src/server/mapAccess.mapper.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Формирует публичную metadata без hashes, refresh history или повторного раскрытия секрета.
 * @see documentation/architecture/platform-access.md
 */
import type {
  AccessTokenDto,
  DeviceRequestDto,
} from "../contracts/Access.types";
import type {
  AccessCredentialRecord,
  AccessDeviceRecord,
} from "./AccessStorage.types";
export function mapAccessToken(
  record: AccessCredentialRecord,
  now = Date.now(),
): AccessTokenDto {
  return {
    id: record.id,
    ownerId: record.ownerId,
    name: record.name,
    kind: record.kind,
    scopes: [...record.scopes],
    prefix: `rza.${record.id}`,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    accessExpiresAt: record.accessExpiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    status: record.revokedAt
      ? "revoked"
      : Date.parse(record.expiresAt) <= now
        ? "expired"
        : "active",
  };
}
export function mapAccessDevice(
  record: AccessDeviceRecord,
  now = Date.now(),
): DeviceRequestDto {
  return {
    userCode: record.userCode,
    clientName: record.clientName,
    scopes: [...record.scopes],
    expiresAt: record.expiresAt,
    status: Date.parse(record.expiresAt) <= now ? "expired" : record.status,
  };
}
