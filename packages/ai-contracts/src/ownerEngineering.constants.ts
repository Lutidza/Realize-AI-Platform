/**
 * @file packages/ai-contracts/src/ownerEngineering.constants.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Фиксирует reserved профиль, срок и domain HMAC инженерного допуска.
 */
export const OWNER_ENGINEERING_PROFILE_KEY = "platform.owner-engineering";
export const OWNER_ENGINEERING_GRANT_TTL_MS = 3_600_000;
export const OWNER_ENGINEERING_GRANT_DOMAIN = "realize:owner-engineering:v1\0";
