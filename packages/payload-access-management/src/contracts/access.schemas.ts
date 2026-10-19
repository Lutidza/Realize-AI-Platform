/**
 * @file packages/payload-access-management/src/contracts/access.schemas.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет явные входы и публичные DTO доступа без закрытых полей хранилища.
 * @see documentation/architecture/platform-access.md
 */
import { z } from "zod";
import { ACCESS_SCOPES } from "./access.constants";
export const accessScopeSchema = z.enum(ACCESS_SCOPES);
export const accessScopesSchema = z
  .array(accessScopeSchema)
  .min(1)
  .max(ACCESS_SCOPES.length)
  .refine(
    (v) => v.includes("task-manager:read") && new Set(v).size === v.length,
    "Read scope is required; scopes must be unique.",
  );
export const accessActorSchema = z.strictObject({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
});
export const accessTokenSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  kind: z.enum(["personal", "api", "cli"]),
  ownerId: z.string().min(1).max(128),
  scopes: accessScopesSchema,
  prefix: z.string().regex(/^rza\.[0-9a-f-]{36}$/),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  accessExpiresAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  status: z.enum(["active", "expired", "revoked"]),
});
const secret = (prefix: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}\\.[0-9a-f-]{36}\\.[A-Za-z0-9_-]{43}$`))
    .refine((value) => z.uuid().safeParse(value.split(".")[1]).success);
export const accessBearerSchema = secret("rza");
export const accessRefreshSchema = secret("rzr");
export const deviceCodeSchema = secret("rzd");
export const userCodeSchema = z
  .string()
  .regex(
    /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/,
  );
export const accessCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["personal", "api"]),
  scopes: accessScopesSchema,
  expiresInDays: z.number().int().min(1).max(365).default(30),
});
export const accessCreateResultSchema = z.strictObject({
  token: accessTokenSchema,
  secret: accessBearerSchema,
});
export const accessPageSchema = z.strictObject({
  items: z.array(accessTokenSchema).max(50),
  nextCursor: z.string().nullable(),
});
export const accessContextSchema = z.strictObject({
  actor: accessActorSchema,
  canManageOthers: z.boolean(),
  scopes: z.array(
    z.strictObject({
      id: accessScopeSchema,
      label: z.string(),
      description: z.string(),
    }),
  ),
});
export const credentialBundleSchema = z.strictObject({
  accessToken: accessBearerSchema,
  refreshToken: accessRefreshSchema,
  accessExpiresAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  token: accessTokenSchema,
  actor: accessActorSchema,
});
export const deviceStartSchema = z.strictObject({
  clientName: z.string().trim().min(1).max(100),
  scopes: accessScopesSchema,
});
export const deviceStartResultSchema = z.strictObject({
  deviceCode: deviceCodeSchema,
  userCode: userCodeSchema,
  verificationUri: z.url(),
  expiresIn: z.literal(600),
  interval: z.literal(5),
});
export const deviceRequestSchema = z.strictObject({
  userCode: userCodeSchema,
  clientName: z.string().min(1).max(100),
  scopes: accessScopesSchema,
  expiresAt: z.iso.datetime(),
  status: z.enum([
    "pending",
    "approved",
    "denied",
    "consumed",
    "cancelled",
    "expired",
  ]),
});
export const deviceDecisionSchema = z.strictObject({
  userCode: userCodeSchema,
  decision: z.enum(["approve", "deny"]),
});
export const deviceSecretInputSchema = z.strictObject({
  deviceCode: deviceCodeSchema,
});
export const deviceTokenResultSchema = z
  .strictObject({
    status: z.enum([
      "authorization_pending",
      "slow_down",
      "access_denied",
      "expired_token",
      "consumed",
      "issued",
    ]),
    interval: z.number().int().min(5).max(60),
    credential: credentialBundleSchema.nullable(),
  })
  .refine((v) => (v.status === "issued") === (v.credential !== null));
export const sessionRefreshSchema = z.strictObject({
  refreshToken: accessRefreshSchema,
});
export const accessSessionSchema = z.strictObject({
  actor: accessActorSchema,
  token: accessTokenSchema.nullable(),
});
export const accessErrorSchema = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({ code: z.string(), message: z.string() }),
});
/** Envelope проверяется владельцем DTO и не допускает дополнительных полей. */
export function accessResponseSchema<T extends z.ZodType>(data: T) {
  return z.union([
    z.strictObject({ ok: z.literal(true), data }),
    accessErrorSchema,
  ]);
}
