/**
 * @file packages/payload-ai-plugin/src/endpoints/access.ts
 * @version 2026-09-02
 * @description Проверяет authentication, scoped authorization и rate limiting endpoints.
 */

import type { PayloadRequest } from "payload";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { EndpointError } from "./http";

const requestsByUser = new Map<string, number[]>();
const RATE_LIMIT = 20;
const WINDOW_MS = 60_000;

export const requireChatUser = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
): Promise<NonNullable<PayloadRequest["user"]>> => {
  if (!req.user)
    throw new EndpointError(
      "UNAUTHENTICATED",
      "Authentication is required.",
      401,
    );
  if (!(await options.access.canUseChat({ req }))) {
    throw new EndpointError(
      "FORBIDDEN",
      "AI chat access is not permitted.",
      403,
    );
  }
  return req.user;
};

/** Requires the dedicated installation-owned permission for integration secrets. */
export const requireIntegrationManager = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
): Promise<NonNullable<PayloadRequest["user"]>> => {
  if (!req.user) {
    throw new EndpointError(
      "UNAUTHENTICATED",
      "Authentication is required.",
      401,
    );
  }
  if (!(await options.access.canManageIntegrations({ req }))) {
    throw new EndpointError(
      "FORBIDDEN",
      "Integration management is not permitted.",
      403,
    );
  }
  return req.user;
};

/** Requires the dedicated permission for installation configuration changes. */
export const requireAIConfigurationManager = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
): Promise<NonNullable<PayloadRequest["user"]>> => {
  if (!req.user) {
    throw new EndpointError(
      "UNAUTHENTICATED",
      "Authentication is required.",
      401,
    );
  }
  if (!(await options.access.canManageAIConfiguration({ req }))) {
    throw new EndpointError(
      "FORBIDDEN",
      "AI configuration management is not permitted.",
      403,
    );
  }
  return req.user;
};

/** Requires an installation-owned capability before any Payload data decision. */
export const requireDataManager = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
): Promise<NonNullable<PayloadRequest["user"]>> => {
  if (!req.user) {
    throw new EndpointError(
      "UNAUTHENTICATED",
      "Authentication is required.",
      401,
    );
  }
  if (!(await options.access.canManageData({ req }))) {
    throw new EndpointError(
      "FORBIDDEN",
      "Payload data management is not permitted.",
      403,
    );
  }
  return req.user;
};

/** Требует отдельное installation-owned право на release approval. */
export const requireReleaseApprover = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
): Promise<NonNullable<PayloadRequest["user"]>> => {
  if (!req.user) {
    throw new EndpointError(
      "UNAUTHENTICATED",
      "Authentication is required.",
      401,
    );
  }
  if (!(await options.access.canApproveRelease({ req }))) {
    throw new EndpointError(
      "FORBIDDEN",
      "Release approval is not permitted.",
      403,
    );
  }
  return req.user;
};

export const consumeRateLimit = (userID: number | string): void => {
  const key = String(userID);
  const now = Date.now();
  const active = (requestsByUser.get(key) || []).filter(
    (value) => now - value < WINDOW_MS,
  );
  if (active.length >= RATE_LIMIT) {
    throw new EndpointError(
      "RATE_LIMITED",
      "Too many AI requests. Retry in one minute.",
      429,
    );
  }
  active.push(now);
  requestsByUser.set(key, active);
};
