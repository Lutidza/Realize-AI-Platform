/**
 * @file packages/change-engine/src/executionCapability.ts
 * @version 2026-08-21
 * @description Issues and verifies short-lived capabilities bound to one execution job.
 */

import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

/** Security-relevant fields signed before a worker may receive workspace-write. */
export type ExecutionCapabilityClaims = {
  allowedPaths: string[];
  baseCommit: string;
  changeRequestID: string;
  checks: string[];
  executionKey: string;
  expiresAt: string;
  issuedAt: string;
  nonce: string;
  planHash: string;
  scopeHash: string;
  version: number;
};

/** Signed token and digest persisted separately from the bearer value. */
export type IssuedExecutionCapability = {
  claims: ExecutionCapabilityClaims;
  token: string;
  tokenHash: string;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const encodeClaims = (claims: ExecutionCapabilityClaims): string =>
  Buffer.from(
    JSON.stringify({
      allowedPaths: [...claims.allowedPaths],
      baseCommit: claims.baseCommit,
      changeRequestID: claims.changeRequestID,
      checks: [...claims.checks],
      executionKey: claims.executionKey,
      expiresAt: claims.expiresAt,
      issuedAt: claims.issuedAt,
      nonce: claims.nonce,
      planHash: claims.planHash,
      schemaVersion: 1,
      scopeHash: claims.scopeHash,
      version: claims.version,
    }),
  ).toString("base64url");

const sign = (payload: string, secret: string): string =>
  createHmac("sha256", secret).update(payload).digest("base64url");

const requireSecret = (secret: string): void => {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Execution signing secret must contain at least 32 bytes.");
  }
};

/** Issues a deterministic HMAC token for explicitly supplied claims. */
export const issueExecutionCapability = (
  claims: ExecutionCapabilityClaims,
  secret: string,
): IssuedExecutionCapability => {
  requireSecret(secret);
  const payload = encodeClaims(claims);
  const token = `${payload}.${sign(payload, secret)}`;
  return { claims, token, tokenHash: sha256(token) };
};

/** Creates fresh claims with a bounded expiry for one approved plan. */
export const createExecutionCapability = (input: {
  allowedPaths: string[];
  baseCommit: string;
  changeRequestID: string;
  checks: string[];
  executionKey: string;
  planHash: string;
  scopeHash: string;
  ttlSeconds: number;
  version: number;
}): ExecutionCapabilityClaims => {
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60) {
    throw new Error("Execution capability TTL must be at least 60 seconds.");
  }
  const issuedAt = new Date();
  return {
    allowedPaths: [...input.allowedPaths],
    baseCommit: input.baseCommit,
    changeRequestID: input.changeRequestID,
    checks: [...input.checks],
    executionKey: input.executionKey,
    expiresAt: new Date(
      issuedAt.getTime() + input.ttlSeconds * 1_000,
    ).toISOString(),
    issuedAt: issuedAt.toISOString(),
    nonce: randomUUID(),
    planHash: input.planHash,
    scopeHash: input.scopeHash,
    version: input.version,
  };
};

/** Verifies signature, digest and expiry before granting workspace-write. */
export const verifyExecutionCapability = (input: {
  claims: ExecutionCapabilityClaims;
  expectedTokenHash: string;
  now?: Date;
  secret: string;
}): boolean => {
  try {
    const issued = issueExecutionCapability(input.claims, input.secret);
    const actual = Buffer.from(issued.tokenHash, "hex");
    const expected = Buffer.from(input.expectedTokenHash, "hex");
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      return false;
    }
    return (
      Date.parse(input.claims.expiresAt) > (input.now || new Date()).getTime()
    );
  } catch {
    return false;
  }
};

/** Binds post-check human acceptance to the exact diff and evidence digest. */
export const createImplementationAcceptanceBinding = (input: {
  actorID: string;
  actorRoles: string[];
  changeRequestID: string;
  decision: "approved" | "rejected";
  diffHash: string;
  evidenceHash: string;
  expiresAt: string;
  planHash: string;
  scopeHash: string;
  version: number;
}): string =>
  sha256(
    JSON.stringify([
      input.changeRequestID,
      input.version,
      input.planHash,
      input.scopeHash,
      input.diffHash,
      input.evidenceHash,
      input.decision,
      input.actorID,
      [...input.actorRoles].sort(),
      input.expiresAt,
    ]),
  );
