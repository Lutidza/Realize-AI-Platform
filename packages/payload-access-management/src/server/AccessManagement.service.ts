/**
 * @file packages/payload-access-management/src/server/AccessManagement.service.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Управляет личными доступами и ограниченным просмотром или отзывом владельцем платформы.
 * @see documentation/architecture/platform-access.md
 */
import type { PayloadRequest } from "payload";
import type { ResolvedAccessManagementOptions } from "../AccessManagementOptions.types";
import type {
  AccessContextDto,
  AccessCreateResult,
  AccessPageDto,
  AccessTokenDto,
} from "../contracts/Access.types";
import { ACCESS_SCOPE_DESCRIPTORS } from "../contracts/access.constants";
import { accessCreateSchema } from "../contracts/access.schemas";
import { ACCESS_CREDENTIALS_SLUG } from "../accessManagement.constants";
import { AccessStoreRepository } from "./AccessStore.repository";
import { AccessCredentialService } from "./AccessCredential.service";
import { accessCredentialRecordSchema } from "./accessStorage.schemas";
import { readAccessBrowserActor } from "./readAccessActor.service";
import { accessForbidden, accessNotFound } from "./AccessManagement.error";
import { mapAccessToken } from "./mapAccess.mapper";
import { createAccessCursor, readAccessCursor } from "./accessCursor.adapter";
import { withAccessTransaction } from "./withAccessTransaction.repository";
import { parseAccessInput } from "./parseAccessInput.validator";
/** Чужие credentials разрешено только читать/отзывать; create всегда использует текущего актёра. */
export class AccessManagementService {
  private readonly store: AccessStoreRepository;
  constructor(
    private readonly req: PayloadRequest,
    private readonly options: ResolvedAccessManagementOptions,
  ) {
    this.store = new AccessStoreRepository(req);
  }
  async context(): Promise<AccessContextDto> {
    const actor = await readAccessBrowserActor(this.req, this.options);
    return {
      actor,
      canManageOthers: await this.options.canManageOthers({ req: this.req }),
      scopes: ACCESS_SCOPE_DESCRIPTORS.map((scope) => ({ ...scope })),
    };
  }
  async list(
    ownerId?: string,
    after: string | null = null,
  ): Promise<AccessPageDto> {
    const actor = await readAccessBrowserActor(this.req, this.options);
    const owner = ownerId ?? actor.id;
    if (
      owner !== actor.id &&
      !(await this.options.canManageOthers({ req: this.req }))
    )
      throw accessForbidden();
    const scope = JSON.stringify([actor.id, owner]);
    const cursor = readAccessCursor(this.req.payload.secret, scope, after);
    const rows = await this.store.rows(
      ACCESS_CREDENTIALS_SLUG,
      {
        and: [
          { ownerId: { equals: owner } },
          ...(cursor ? [{ id: { less_than: cursor } }] : []),
        ],
      },
      51,
      "-id",
    );
    return {
      items: rows
        .slice(0, 50)
        .map((row) =>
          mapAccessToken(accessCredentialRecordSchema.parse(row.record)),
        ),
      nextCursor:
        rows.length > 50
          ? createAccessCursor(this.req.payload.secret, scope, rows[49].id)
          : null,
    };
  }
  async create(value: unknown): Promise<AccessCreateResult> {
    const input = parseAccessInput(accessCreateSchema, value);
    const actor = await readAccessBrowserActor(this.req, this.options, true);
    return withAccessTransaction(this.req, [`owner:${actor.id}`], async () => {
      const current = await readAccessBrowserActor(
        this.req,
        this.options,
        true,
      );
      if (current.id !== actor.id) throw accessForbidden();
      const issued = await new AccessCredentialService(
        this.req,
        this.options,
      ).issue(
        current,
        input.name,
        input.kind,
        input.scopes,
        input.expiresInDays,
      );
      return {
        token: mapAccessToken(issued.record),
        secret: issued.accessToken,
      };
    });
  }
  async revoke(id: string): Promise<AccessTokenDto> {
    const actor = await readAccessBrowserActor(this.req, this.options, true);
    return withAccessTransaction(this.req, [`credential:${id}`], async () => {
      const current = await readAccessBrowserActor(
        this.req,
        this.options,
        true,
      );
      if (current.id !== actor.id) throw accessForbidden();
      const row = await this.store.one(ACCESS_CREDENTIALS_SLUG, {
        credentialId: { equals: id },
      });
      if (!row) throw accessNotFound();
      const record = accessCredentialRecordSchema.parse(row.record);
      if (
        record.ownerId !== actor.id &&
        !(await this.options.canManageOthers({ req: this.req }))
      )
        throw accessNotFound();
      const next = record.revokedAt
        ? record
        : { ...record, revokedAt: new Date().toISOString() };
      if (!record.revokedAt)
        await this.store.update(ACCESS_CREDENTIALS_SLUG, row.id, {
          record: next,
        });
      return mapAccessToken(next);
    });
  }
}
