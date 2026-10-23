/**
 * @file services/ai-control-plane/src/owner-engineering/verifyOwnerEngineeringGrant.validator.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Сверяет HMAC допуска с run, immutable профилем, машиной и allowlist владельцев.
 * @see documentation/architecture/codex-integration.md
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  encodeOwnerEngineeringGrant,
  OWNER_ENGINEERING_GRANT_DOMAIN,
  OWNER_ENGINEERING_PROFILE_KEY,
} from "@realize/ai-contracts";
import type { ControlPlaneRun } from "../runStore";
import type { OwnerEngineeringConfiguration } from "./OwnerEngineeringRuntime.types";
import { parseOwnerEngineeringGrant } from "./parseOwnerEngineeringGrant.validator";

/** HMAC не заменяет текущую серверную конфигурацию; несовпадение закрывает только инженерный запуск. */
export const verifyOwnerEngineeringGrant = (
  run: Pick<ControlPlaneRun, "id" | "ownerEngineering" | "agentConfiguration">,
  configuration: OwnerEngineeringConfiguration | null,
  token: string,
  now = Date.now(),
) => {
  const grant = parseOwnerEngineeringGrant(run.ownerEngineering);
  if (
    !configuration ||
    token.length < 32 ||
    grant.runID !== run.id ||
    grant.workspaceRoot !== configuration.workspaceRoot ||
    !configuration.ownerIDs.includes(grant.actorID) ||
    run.agentConfiguration?.compiled.profile.key !==
      OWNER_ENGINEERING_PROFILE_KEY ||
    run.agentConfiguration.compiled.compiledContextHash !==
      grant.configurationHash ||
    grant.issuedAt > now + 30_000 ||
    grant.expiresAt <= now
  )
    throw Error("owner_engineering_admission_denied");
  const expected = createHmac("sha256", token)
    .update(OWNER_ENGINEERING_GRANT_DOMAIN)
    .update(encodeOwnerEngineeringGrant(grant))
    .digest("base64url");
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(grant.signature)))
    throw Error("owner_engineering_admission_denied");
  return grant;
};
