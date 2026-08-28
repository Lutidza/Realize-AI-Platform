/**
 * @file packages/payload-ai-plugin/src/endpoints/integrationHandlerSupport.ts
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Owns transaction, idempotency replay and credential helpers for integration handlers.
 */

import type { GitHubIntegrationTestDTO } from "@realize/ai-contracts";
import { commitTransaction, initTransaction, killTransaction } from "payload";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import {
  decryptIntegrationCredential,
  IntegrationVaultError,
} from "../integrations/credentialVault";
import { PRIMARY_GITHUB_CONNECTION_KEY } from "../integrations/providers";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { EndpointError } from "./http";
import { relationID } from "./mappers";

type HandlerRequest = Parameters<PayloadEndpointHandler>[0];

/** Returns the single fail-closed error used for unavailable secret material. */
export const integrationVaultError = (): EndpointError =>
  new EndpointError(
    "INTEGRATION_UNAVAILABLE",
    "Integration credential vault is not configured or cannot decrypt this credential.",
    503,
  );

/** Threads all writes through the Payload request transaction. */
export const runIntegrationTransaction = async <T>(
  req: HandlerRequest,
  operation: () => Promise<T>,
): Promise<T> => {
  const started = await initTransaction(req);
  try {
    const result = await operation();
    if (started) await commitTransaction(req);
    return result;
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
};

/** Prevents an idempotency key from crossing provider, action or actor scope. */
export const requireMatchingIntegrationReplay = (
  event: Record<string, unknown>,
  action: "disconnected" | "saved" | "tested",
  actorID: number | string,
): void => {
  if (
    event.provider !== "github" ||
    event.action !== action ||
    relationID(event.actor) !== String(actorID)
  ) {
    throw new EndpointError(
      "CONFLICT",
      "Idempotency-Key was already used for another integration operation.",
      409,
    );
  }
};

/** Reconstructs only the safe provider result persisted in redacted audit. */
export const replayedGitHubTest = (
  event: Record<string, unknown>,
): GitHubIntegrationTestDTO => {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Stored integration test audit is invalid.");
  }
  const value = metadata as Record<string, unknown>;
  if (
    (value.status !== "passed" && value.status !== "failed") ||
    typeof value.checkedAt !== "string" ||
    typeof value.message !== "string" ||
    typeof value.repositorySlug !== "string"
  ) {
    throw new Error("Stored integration test audit is invalid.");
  }
  return {
    checkedAt: value.checkedAt,
    ...(typeof value.defaultBranch === "string"
      ? { defaultBranch: value.defaultBranch }
      : {}),
    message: value.message,
    repositorySlug: value.repositorySlug,
    status: value.status,
  };
};

/** Decrypts a stored primary GitHub credential without leaking vault failures. */
export const decryptGitHubCredential = (
  envelope: unknown,
  options: SanitizedRealizeAIPluginOptions,
): string => {
  if (typeof envelope !== "string" || !envelope) {
    throw integrationVaultError();
  }
  try {
    return decryptIntegrationCredential({
      binding: {
        connectionKey: PRIMARY_GITHUB_CONNECTION_KEY,
        provider: "github",
      },
      encryptionKey: process.env[options.integrations.encryptionKeyEnv],
      envelope,
    });
  } catch (error) {
    if (error instanceof IntegrationVaultError) {
      throw integrationVaultError();
    }
    throw error;
  }
};
