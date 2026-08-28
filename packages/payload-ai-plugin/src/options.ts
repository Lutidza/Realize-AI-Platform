/**
 * @file packages/payload-ai-plugin/src/options.ts
 * @version 2026-08-28
 * @description Проверяет plugin options, включая source, release и integration security gates.
 */

import { DEFAULT_ADMIN_ROUTE, DEFAULT_INTEGRATIONS_ROUTE } from "./constants";
import { resolve } from "node:path";
import type {
  RealizeAIPluginOptions,
  SanitizedRealizeAIPluginOptions,
} from "./types";

/** Проверяет security-sensitive URLs и применяет deterministic plugin defaults. */
export const sanitizeOptions = (
  options: RealizeAIPluginOptions,
): SanitizedRealizeAIPluginOptions => {
  const route = options.admin?.route || DEFAULT_ADMIN_ROUTE;
  const integrationsRoute =
    options.admin?.integrationsRoute || DEFAULT_INTEGRATIONS_ROUTE;
  if (!route.startsWith("/") || route === "/") {
    throw new Error(
      'Realize AI admin route must begin with "/" and contain a segment.',
    );
  }
  if (!integrationsRoute.startsWith("/") || integrationsRoute === "/") {
    throw new Error(
      'Realize integrations admin route must begin with "/" and contain a segment.',
    );
  }
  if (route === integrationsRoute) {
    throw new Error("Realize AI and integrations admin routes must differ.");
  }
  if (!/^[A-Z_][A-Z0-9_]*$/.test(options.runtime.controlPlaneTokenEnv)) {
    throw new Error(
      "Realize AI controlPlaneTokenEnv must be an environment variable name.",
    );
  }
  const executionSigningSecretEnv =
    options.execution?.signingSecretEnv ||
    "REALIZE_AI_EXECUTION_SIGNING_SECRET";
  if (!/^[A-Z_][A-Z0-9_]*$/.test(executionSigningSecretEnv)) {
    throw new Error(
      "Realize AI execution signingSecretEnv must be an environment variable name.",
    );
  }
  const integrationEncryptionKeyEnv =
    options.integrations?.encryptionKeyEnv ||
    "REALIZE_INTEGRATIONS_ENCRYPTION_KEY";
  if (!/^[A-Z_][A-Z0-9_]*$/.test(integrationEncryptionKeyEnv)) {
    throw new Error(
      "Realize integrations encryptionKeyEnv must be an environment variable name.",
    );
  }
  const capabilityTTLSeconds = options.execution?.capabilityTTLSeconds || 3_600;
  const artifactsTTLSeconds = options.execution?.artifactsTTLSeconds || 86_400;
  const previewTTLSeconds = options.preview?.ttlSeconds || 21_600;
  const releaseTTLSeconds = options.release?.ttlSeconds || 86_400;
  if (!Number.isInteger(capabilityTTLSeconds) || capabilityTTLSeconds < 60) {
    throw new Error("Execution capability TTL must be at least 60 seconds.");
  }
  if (!Number.isInteger(artifactsTTLSeconds) || artifactsTTLSeconds < 3_600) {
    throw new Error("Execution artifacts TTL must be at least 3600 seconds.");
  }
  if (!Number.isInteger(previewTTLSeconds) || previewTTLSeconds < 900) {
    throw new Error("Preview TTL must be at least 900 seconds.");
  }
  if (!Number.isInteger(releaseTTLSeconds) || releaseTTLSeconds < 3_600) {
    throw new Error("Release TTL must be at least 3600 seconds.");
  }
  if (options.runtime.controlPlaneURL) {
    const url = new URL(options.runtime.controlPlaneURL);
    const isLoopback = ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
    if (options.runtime.mode === "local-development" && !isLoopback) {
      throw new Error(
        "Local-development control plane must use a loopback URL.",
      );
    }
    if (
      options.runtime.mode === "central-control-plane" &&
      url.protocol !== "https:"
    ) {
      throw new Error("Central control plane must use HTTPS.");
    }
  }

  return {
    access: options.access,
    admin: {
      group: options.admin?.group || "AI & Delivery",
      integrationsRoute,
      route,
    },
    enabled: options.enabled ?? false,
    execution: {
      artifactsTTLSeconds,
      capabilityTTLSeconds,
      enabled: options.execution?.enabled ?? false,
      repositoryRoot: resolve(
        options.execution?.repositoryRoot || process.cwd(),
      ),
      signingSecretEnv: executionSigningSecretEnv,
    },
    integrations: {
      encryptionKeyEnv: integrationEncryptionKeyEnv,
    },
    preview: {
      enabled: options.preview?.enabled ?? false,
      ttlSeconds: previewTTLSeconds,
    },
    release: {
      enabled: options.release?.enabled ?? false,
      ttlSeconds: releaseTTLSeconds,
    },
    sourcePromotion: {
      enabled: options.sourcePromotion?.enabled ?? false,
    },
    runtime: options.runtime,
    userCollection: options.userCollection || "users",
  };
};
