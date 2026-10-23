/**
 * @file packages/ai-contracts/src/ownerEngineeringGrant.util.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Фиксирует канонический порядок подписываемых полей допуска владельца.
 */
import type { OwnerEngineeringGrant } from "./OwnerEngineering.types";

/** Одинаковые байты для HMAC производителя и проверяющего; подпись не подписывает сама себя. */
export const encodeOwnerEngineeringGrant = (
  grant: Omit<OwnerEngineeringGrant, "signature">,
): string =>
  JSON.stringify({
    schemaVersion: grant.schemaVersion,
    runID: grant.runID,
    actorID: grant.actorID,
    profileKey: grant.profileKey,
    configurationHash: grant.configurationHash,
    workspaceRoot: grant.workspaceRoot,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
  });
