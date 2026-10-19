/**
 * @file packages/payload-access-management/src/server/AccessCredential.service.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Выпускает hash-only credentials и атомарно ротирует CLI refresh с reuse detection.
 * @see documentation/architecture/platform-access.md
 */
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import type {
  AccessActorDto,
  AccessScope,
  CredentialBundle,
} from "../contracts/Access.types";
import type { ResolvedAccessManagementOptions } from "../AccessManagementOptions.types";
import {
  ACCESS_CLI_SECONDS,
  ACCESS_SESSION_SECONDS,
} from "../contracts/access.constants";
import {
  ACCESS_CREDENTIALS_SLUG,
  ACCESS_REFRESH_HISTORY_SLUG,
} from "../accessManagement.constants";
import { AccessStoreRepository } from "./AccessStore.repository";
import type { AccessCredentialRecord } from "./AccessStorage.types";
import { accessCredentialRecordSchema } from "./accessStorage.schemas";
import { accessUnauthenticated } from "./AccessManagement.error";
import {
  createAccessSecret,
  equalAccessHash,
  hashAccessSecret,
  readAccessSecret,
} from "./accessSecret.adapter";
import { mapAccessToken } from "./mapAccess.mapper";
import { readAccessActor } from "./readAccessActor.service";
import { withAccessTransaction } from "./withAccessTransaction.repository";
/** Все записи вызываются внутри credential/device lock; plaintext возвращается только текущему запросу. */
export class AccessCredentialService {
  private readonly store: AccessStoreRepository;
  constructor(
    private readonly req: PayloadRequest,
    private readonly options: ResolvedAccessManagementOptions,
  ) {
    this.store = new AccessStoreRepository(req);
  }
  async issue(
    actor: AccessActorDto,
    name: string,
    kind: "personal" | "api" | "cli",
    scopes: AccessScope[],
    expiresInDays = 30,
  ) {
    const now = Date.now();
    const id = randomUUID();
    const accessToken = createAccessSecret("rza", id);
    const refreshToken = kind === "cli" ? createAccessSecret("rzr", id) : null;
    const expiresAt = new Date(
      now +
        (kind === "cli" ? ACCESS_SESSION_SECONDS : expiresInDays * 86400) *
          1000,
    ).toISOString();
    const record: AccessCredentialRecord = {
      id,
      ownerId: actor.id,
      name,
      kind,
      scopes: [...scopes],
      createdAt: new Date(now).toISOString(),
      expiresAt,
      accessExpiresAt:
        kind === "cli"
          ? new Date(now + ACCESS_CLI_SECONDS * 1000).toISOString()
          : expiresAt,
      lastUsedAt: null,
      revokedAt: null,
      accessHash: hashAccessSecret(accessToken),
      refreshHash: refreshToken ? hashAccessSecret(refreshToken) : null,
    };
    await this.store.create(ACCESS_CREDENTIALS_SLUG, {
      credentialId: id,
      ownerId: actor.id,
      expiresAt,
      record,
    });
    return { record, accessToken, refreshToken };
  }
  async issueCLI(
    actor: AccessActorDto,
    name: string,
    scopes: AccessScope[],
  ): Promise<CredentialBundle> {
    const issued = await this.issue(actor, name, "cli", scopes);
    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken!,
      accessExpiresAt: issued.record.accessExpiresAt,
      expiresAt: issued.record.expiresAt,
      token: mapAccessToken(issued.record),
      actor,
    };
  }
  async refresh(value: string): Promise<CredentialBundle> {
    const secret = readAccessSecret(value, "refresh");
    const result = await withAccessTransaction(
      this.req,
      [`credential:${secret.id}`],
      async () => {
        const row = await this.store.one(ACCESS_CREDENTIALS_SLUG, {
          credentialId: { equals: secret.id },
        });
        if (!row) return null;
        const record = accessCredentialRecordSchema.parse(row.record);
        if (
          record.kind !== "cli" ||
          record.revokedAt ||
          Date.parse(record.expiresAt) <= Date.now()
        )
          return null;
        if (
          !record.refreshHash ||
          !equalAccessHash(secret.value, record.refreshHash)
        ) {
          const old = await this.store.one(ACCESS_REFRESH_HISTORY_SLUG, {
            and: [
              { credentialId: { equals: record.id } },
              { refreshHash: { equals: hashAccessSecret(secret.value) } },
            ],
          });
          if (old)
            await this.store.update(ACCESS_CREDENTIALS_SLUG, row.id, {
              record: { ...record, revokedAt: new Date().toISOString() },
            });
          // Revocation commits before the public 401: throwing inside txn would undo reuse detection.
          return null;
        }
        const actor = await readAccessActor(
          this.req,
          this.options,
          record.ownerId,
        );
        const accessToken = createAccessSecret("rza", record.id);
        const refreshToken = createAccessSecret("rzr", record.id);
        const next: AccessCredentialRecord = {
          ...record,
          accessHash: hashAccessSecret(accessToken),
          refreshHash: hashAccessSecret(refreshToken),
          accessExpiresAt: new Date(
            Math.min(
              Date.now() + ACCESS_CLI_SECONDS * 1000,
              Date.parse(record.expiresAt),
            ),
          ).toISOString(),
          lastUsedAt: new Date().toISOString(),
        };
        await this.store.create(ACCESS_REFRESH_HISTORY_SLUG, {
          refreshHash: record.refreshHash,
          credentialId: record.id,
          expiresAt: record.expiresAt,
        });
        await this.store.update(ACCESS_CREDENTIALS_SLUG, row.id, {
          record: next,
        });
        return {
          accessToken,
          refreshToken,
          accessExpiresAt: next.accessExpiresAt,
          expiresAt: next.expiresAt,
          token: mapAccessToken(next),
          actor,
        };
      },
    );
    if (!result) throw accessUnauthenticated();
    return result;
  }
  async logout(value: string): Promise<{ revoked: true }> {
    const secret = readAccessSecret(value, "refresh");
    const valid = await withAccessTransaction(
      this.req,
      [`credential:${secret.id}`],
      async () => {
        const row = await this.store.one(ACCESS_CREDENTIALS_SLUG, {
          credentialId: { equals: secret.id },
        });
        if (!row) return false;
        const record = accessCredentialRecordSchema.parse(row.record);
        const current =
          record.refreshHash &&
          equalAccessHash(secret.value, record.refreshHash);
        const previous = current
          ? true
          : await this.store.one(ACCESS_REFRESH_HISTORY_SLUG, {
              and: [
                { credentialId: { equals: record.id } },
                { refreshHash: { equals: hashAccessSecret(secret.value) } },
              ],
            });
        if (record.kind !== "cli" || !previous) return false;
        if (!record.revokedAt)
          await this.store.update(ACCESS_CREDENTIALS_SLUG, row.id, {
            record: { ...record, revokedAt: new Date().toISOString() },
          });
        return true;
      },
    );
    if (!valid) throw accessUnauthenticated();
    return { revoked: true };
  }
}
