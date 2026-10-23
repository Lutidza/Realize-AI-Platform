/**
 * @file packages/ai-contracts/src/OwnerEngineering.types.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Задаёт серверный допуск владельца к исполнению на машине установки и безопасный снимок запуска.
 */

import type { OWNER_ENGINEERING_PROFILE_KEY } from "./ownerEngineering.constants";

/** Закрытый HMAC-допуск на один run; браузер и сохранённые DTO не получают подпись. */
export type OwnerEngineeringGrant = {
  schemaVersion: "1.0";
  runID: string;
  actorID: string;
  profileKey: typeof OWNER_ENGINEERING_PROFILE_KEY;
  configurationHash: string;
  workspaceRoot: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
};

/** Аудит выбранного режима без права повторного исполнения и секретов допуска. */
export type OwnerEngineeringRunMetadata = {
  mode: "owner-host";
  actorID: string;
  profileKey: typeof OWNER_ENGINEERING_PROFILE_KEY;
  configurationHash: string;
  workspaceRoot: string;
};
