/**
 * @file packages/payload-access-management/src/contracts/Access.types.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Экспортирует DTO токенов, подтверждения CLI и browser управления.
 * @see documentation/architecture/platform-access.md
 */
import type { z } from "zod";
import type {
  accessActorSchema,
  accessContextSchema,
  accessCreateSchema,
  accessCreateResultSchema,
  accessPageSchema,
  accessScopeSchema,
  accessSessionSchema,
  accessTokenSchema,
  credentialBundleSchema,
  deviceDecisionSchema,
  deviceRequestSchema,
  deviceStartResultSchema,
  deviceStartSchema,
  deviceTokenResultSchema,
} from "./access.schemas";
export type AccessScope = z.infer<typeof accessScopeSchema>;
export type AccessActorDto = z.infer<typeof accessActorSchema>;
export type AccessTokenDto = z.infer<typeof accessTokenSchema>;
export type AccessContextDto = z.infer<typeof accessContextSchema>;
export type AccessCreateInput = z.infer<typeof accessCreateSchema>;
export type AccessCreateResult = z.infer<typeof accessCreateResultSchema>;
export type AccessPageDto = z.infer<typeof accessPageSchema>;
export type AccessSessionDto = z.infer<typeof accessSessionSchema>;
export type CredentialBundle = z.infer<typeof credentialBundleSchema>;
export type DeviceStartInput = z.infer<typeof deviceStartSchema>;
export type DeviceStartResult = z.infer<typeof deviceStartResultSchema>;
export type DeviceRequestDto = z.infer<typeof deviceRequestSchema>;
export type DeviceDecisionInput = z.infer<typeof deviceDecisionSchema>;
export type DeviceTokenResult = z.infer<typeof deviceTokenResultSchema>;
export type AccessApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
