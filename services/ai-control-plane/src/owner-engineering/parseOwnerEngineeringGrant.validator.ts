/**
 * @file services/ai-control-plane/src/owner-engineering/parseOwnerEngineeringGrant.validator.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Проверяет строгую форму закрытого допуска без выдачи полномочий по одному JSON.
 * @see documentation/architecture/codex-integration.md
 */
import {
  OWNER_ENGINEERING_PROFILE_KEY,
  OWNER_ENGINEERING_GRANT_TTL_MS,
} from "@realize/ai-contracts";
import type { OwnerEngineeringGrant } from "@realize/ai-contracts";
import { isAbsolute } from "node:path";

export const parseOwnerEngineeringGrant = (
  value: unknown,
): OwnerEngineeringGrant => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("owner_engineering_grant_invalid");
  const grant = value as Record<string, unknown>;
  if (
    Object.keys(grant).sort().join(",") !==
      "actorID,configurationHash,expiresAt,issuedAt,profileKey,runID,schemaVersion,signature,workspaceRoot" ||
    grant.schemaVersion !== "1.0" ||
    grant.profileKey !== OWNER_ENGINEERING_PROFILE_KEY ||
    typeof grant.runID !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(grant.runID) ||
    typeof grant.actorID !== "string" ||
    !/^[1-9]\d{0,14}$/.test(grant.actorID) ||
    typeof grant.configurationHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(grant.configurationHash) ||
    typeof grant.workspaceRoot !== "string" ||
    grant.workspaceRoot.length > 4096 ||
    !isAbsolute(grant.workspaceRoot) ||
    grant.workspaceRoot.includes("\0") ||
    typeof grant.signature !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(grant.signature) ||
    !Number.isSafeInteger(grant.issuedAt) ||
    !Number.isSafeInteger(grant.expiresAt) ||
    Number(grant.issuedAt) <= 0 ||
    Number(grant.expiresAt) - Number(grant.issuedAt) !==
      OWNER_ENGINEERING_GRANT_TTL_MS
  )
    throw Error("owner_engineering_grant_invalid");
  return grant as OwnerEngineeringGrant;
};
