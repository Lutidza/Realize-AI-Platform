/**
 * @file packages/payload-access-management/src/server/AccessDevice.service.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Ведёт короткоживущий запрос подтверждения CLI с атомарным единственным обменом и отменой.
 * @see documentation/architecture/platform-access.md
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import type { ResolvedAccessManagementOptions } from "../AccessManagementOptions.types";
import type {
  DeviceRequestDto,
  DeviceStartResult,
  DeviceTokenResult,
} from "../contracts/Access.types";
import {
  ACCESS_DEVICE_INTERVAL,
  ACCESS_DEVICE_SECONDS,
} from "../contracts/access.constants";
import {
  deviceDecisionSchema,
  deviceStartSchema,
} from "../contracts/access.schemas";
import {
  ACCESS_CREDENTIALS_SLUG,
  ACCESS_DEVICES_SLUG,
} from "../accessManagement.constants";
import { AccessStoreRepository } from "./AccessStore.repository";
import { AccessCredentialService } from "./AccessCredential.service";
import {
  accessCredentialRecordSchema,
  accessDeviceRecordSchema,
} from "./accessStorage.schemas";
import type { AccessDeviceRecord } from "./AccessStorage.types";
import {
  readAccessActor,
  readAccessBrowserActor,
} from "./readAccessActor.service";
import {
  AccessManagementError,
  accessNotFound,
  accessUnauthenticated,
} from "./AccessManagement.error";
import {
  createAccessSecret,
  equalAccessHash,
  hashAccessSecret,
  readAccessSecret,
} from "./accessSecret.adapter";
import { mapAccessDevice } from "./mapAccess.mapper";
import {
  lockAccessScope,
  withAccessTransaction,
} from "./withAccessTransaction.repository";
import {
  allowAccessCodeLookup,
  consumeAccessBudget,
} from "./AccessThrottle.service";
import { parseAccessInput } from "./parseAccessInput.validator";
const limited = () =>
  new AccessManagementError(
    "RATE_LIMITED",
    "Слишком много запросов. Повторите позже.",
    429,
  );
/** User code нужен для явного согласия человека; bearer является только deviceCode. */
export class AccessDeviceService {
  private readonly store: AccessStoreRepository;
  constructor(
    private readonly req: PayloadRequest,
    private readonly options: ResolvedAccessManagementOptions,
  ) {
    this.store = new AccessStoreRepository(req);
  }
  async start(value: unknown): Promise<DeviceStartResult> {
    const input = parseAccessInput(deviceStartSchema, value);
    const result = await withAccessTransaction(
      this.req,
      ["device-start"],
      async () => {
        if (!(await consumeAccessBudget(this.req, "device-start", 20, 60)))
          return null;
        if (
          (await this.store.count(ACCESS_DEVICES_SLUG, {
            expiresAt: { greater_than: new Date().toISOString() },
          })) >= 100
        )
          return null;
        await this.store.deleteExpired(
          ACCESS_DEVICES_SLUG,
          new Date(Date.now() - 86400000).toISOString(),
        );
        const id = randomUUID();
        const deviceCode = createAccessSecret("rzd", id);
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let userCode = "";
        for (let attempt = 0; attempt < 10; attempt++) {
          const code = [...randomBytes(8)]
            .map((byte) => alphabet[byte % alphabet.length])
            .join("");
          userCode = `${code.slice(0, 4)}-${code.slice(4)}`;
          if (
            !(await this.store.one(ACCESS_DEVICES_SLUG, {
              userCode: { equals: userCode },
            }))
          )
            break;
          userCode = "";
        }
        if (!userCode) throw limited();
        const record: AccessDeviceRecord = {
          id,
          deviceHash: hashAccessSecret(deviceCode),
          userCode,
          clientName: input.clientName,
          scopes: input.scopes,
          expiresAt: new Date(
            Date.now() + ACCESS_DEVICE_SECONDS * 1000,
          ).toISOString(),
          status: "pending",
          ownerId: null,
          credentialId: null,
          interval: ACCESS_DEVICE_INTERVAL,
          lastPollAt: null,
        };
        await this.store.create(ACCESS_DEVICES_SLUG, {
          deviceId: id,
          userCode,
          expiresAt: record.expiresAt,
          record,
        });
        return {
          deviceCode,
          userCode,
          verificationUri: `${this.options.publicURL}/system/access/device`,
          expiresIn: ACCESS_DEVICE_SECONDS,
          interval: ACCESS_DEVICE_INTERVAL,
        } as const;
      },
    );
    if (!result) throw limited();
    return result;
  }
  async read(userCode: string): Promise<DeviceRequestDto> {
    const actor = await readAccessBrowserActor(this.req, this.options);
    if (!(await allowAccessCodeLookup(this.req, actor.id))) throw limited();
    const row = await this.store.one(ACCESS_DEVICES_SLUG, {
      userCode: { equals: userCode },
    });
    if (!row) throw accessNotFound();
    const record = accessDeviceRecordSchema.parse(row.record);
    if (record.ownerId && record.ownerId !== actor.id) throw accessNotFound();
    return mapAccessDevice(record);
  }
  async decide(value: unknown): Promise<DeviceRequestDto> {
    const input = parseAccessInput(deviceDecisionSchema, value);
    const actor = await readAccessBrowserActor(this.req, this.options, true);
    if (!(await allowAccessCodeLookup(this.req, actor.id))) throw limited();
    const initial = await this.store.one(ACCESS_DEVICES_SLUG, {
      userCode: { equals: input.userCode },
    });
    if (!initial) throw accessNotFound();
    const id = accessDeviceRecordSchema.parse(initial.record).id;
    return withAccessTransaction(this.req, [`device:${id}`], async () => {
      const current = await readAccessBrowserActor(
        this.req,
        this.options,
        true,
      );
      if (current.id !== actor.id) throw accessUnauthenticated();
      const row = await this.store.one(ACCESS_DEVICES_SLUG, {
        deviceId: { equals: id },
      });
      if (!row) throw accessNotFound();
      const record = accessDeviceRecordSchema.parse(row.record);
      if (record.ownerId && record.ownerId !== actor.id) throw accessNotFound();
      if (
        Date.parse(record.expiresAt) <= Date.now() ||
        record.status !== "pending"
      )
        return mapAccessDevice(record);
      const next = {
        ...record,
        ownerId: actor.id,
        status:
          input.decision === "approve"
            ? ("approved" as const)
            : ("denied" as const),
      };
      await this.store.update(ACCESS_DEVICES_SLUG, row.id, { record: next });
      return mapAccessDevice(next);
    });
  }
  async poll(value: string): Promise<DeviceTokenResult> {
    const secret = readAccessSecret(value, "device");
    return withAccessTransaction(
      this.req,
      [`device:${secret.id}`],
      async () => {
        const row = await this.store.one(ACCESS_DEVICES_SLUG, {
          deviceId: { equals: secret.id },
        });
        if (!row) throw accessUnauthenticated();
        const record = accessDeviceRecordSchema.parse(row.record);
        if (!equalAccessHash(secret.value, record.deviceHash))
          throw accessUnauthenticated();
        const response = (
          status: DeviceTokenResult["status"],
          interval = record.interval,
        ): DeviceTokenResult => ({ status, interval, credential: null });
        const now = Date.now();
        if (Date.parse(record.expiresAt) <= now)
          return response("expired_token");
        if (record.status === "denied" || record.status === "cancelled")
          return response("access_denied");
        if (record.status === "consumed") return response("consumed");
        if (
          record.lastPollAt &&
          now - Date.parse(record.lastPollAt) < record.interval * 1000
        ) {
          const interval = Math.min(60, record.interval + 5);
          await this.store.update(ACCESS_DEVICES_SLUG, row.id, {
            record: {
              ...record,
              interval,
              lastPollAt: new Date(now).toISOString(),
            },
          });
          return response("slow_down", interval);
        }
        if (record.status === "pending") {
          await this.store.update(ACCESS_DEVICES_SLUG, row.id, {
            record: { ...record, lastPollAt: new Date(now).toISOString() },
          });
          return response("authorization_pending");
        }
        if (!record.ownerId) throw accessUnauthenticated();
        let actor;
        try {
          actor = await readAccessActor(this.req, this.options, record.ownerId);
        } catch (error) {
          if (
            !(error instanceof AccessManagementError) ||
            ![401, 403].includes(error.status)
          )
            throw error;
          await this.store.update(ACCESS_DEVICES_SLUG, row.id, {
            record: { ...record, status: "denied" },
          });
          return response("access_denied");
        }
        const credential = await new AccessCredentialService(
          this.req,
          this.options,
        ).issueCLI(actor, record.clientName, record.scopes);
        await this.store.update(ACCESS_DEVICES_SLUG, row.id, {
          record: {
            ...record,
            status: "consumed",
            credentialId: credential.token.id,
            lastPollAt: new Date(now).toISOString(),
          },
        });
        return { status: "issued", interval: record.interval, credential };
      },
    );
  }
  async cancel(value: string): Promise<{ cancelled: true }> {
    const secret = readAccessSecret(value, "device");
    return withAccessTransaction(
      this.req,
      [`device:${secret.id}`],
      async () => {
        const row = await this.store.one(ACCESS_DEVICES_SLUG, {
          deviceId: { equals: secret.id },
        });
        if (!row) throw accessUnauthenticated();
        const record = accessDeviceRecordSchema.parse(row.record);
        if (
          !equalAccessHash(secret.value, record.deviceHash) ||
          Date.parse(record.expiresAt) <= Date.now()
        )
          throw accessUnauthenticated();
        if (record.credentialId) {
          await lockAccessScope(this.req, `credential:${record.credentialId}`);
          const issued = await this.store.one(ACCESS_CREDENTIALS_SLUG, {
            credentialId: { equals: record.credentialId },
          });
          if (issued) {
            const credential = accessCredentialRecordSchema.parse(
              issued.record,
            );
            if (!credential.revokedAt)
              await this.store.update(ACCESS_CREDENTIALS_SLUG, issued.id, {
                record: { ...credential, revokedAt: new Date().toISOString() },
              });
          }
        }
        if (record.status !== "cancelled")
          await this.store.update(ACCESS_DEVICES_SLUG, row.id, {
            record: { ...record, status: "cancelled" },
          });
        return { cancelled: true };
      },
    );
  }
}
