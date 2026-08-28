/**
 * @file packages/payload-ai-plugin/src/types.ts
 * @version 2026-08-28
 * @description Задаёт public configuration contract AI, source/release delivery и integrations.
 */

import type { CollectionSlug, PayloadRequest } from "payload";

/** Installation-owned authorization callback на основе Payload request. */
export type RealizeAIAccessResolver = (args: {
  req: PayloadRequest;
}) => boolean | Promise<boolean>;

/** Публичные options Realize AI Payload config transformer. */
export type RealizeAIPluginOptions = {
  access: {
    canApproveRelease: RealizeAIAccessResolver;
    canManageData: RealizeAIAccessResolver;
    canManageIntegrations: RealizeAIAccessResolver;
    canUseChat: RealizeAIAccessResolver;
    canViewRuns: RealizeAIAccessResolver;
  };
  admin?: {
    group?: string;
    integrationsRoute?: `/${string}`;
    route?: `/${string}`;
  };
  enabled?: boolean;
  execution?: {
    artifactsTTLSeconds?: number;
    capabilityTTLSeconds?: number;
    enabled?: boolean;
    repositoryRoot?: string;
    signingSecretEnv?: string;
  };
  integrations?: {
    encryptionKeyEnv?: string;
  };
  preview?: {
    enabled?: boolean;
    ttlSeconds?: number;
  };
  release?: {
    enabled?: boolean;
    ttlSeconds?: number;
  };
  sourcePromotion?: {
    enabled?: boolean;
  };
  runtime: {
    controlPlaneTokenEnv: string;
    controlPlaneURL?: string;
    mode: "central-control-plane" | "local-development";
    model?: string;
  };
  userCollection?: CollectionSlug;
};

/** Нормализованные internal options после defaults и boundary validation. */
export type SanitizedRealizeAIPluginOptions = {
  access: RealizeAIPluginOptions["access"];
  admin: {
    group: string;
    integrationsRoute: `/${string}`;
    route: `/${string}`;
  };
  enabled: boolean;
  execution: {
    artifactsTTLSeconds: number;
    capabilityTTLSeconds: number;
    enabled: boolean;
    repositoryRoot: string;
    signingSecretEnv: string;
  };
  integrations: {
    encryptionKeyEnv: string;
  };
  preview: {
    enabled: boolean;
    ttlSeconds: number;
  };
  release: {
    enabled: boolean;
    ttlSeconds: number;
  };
  sourcePromotion: {
    enabled: boolean;
  };
  runtime: RealizeAIPluginOptions["runtime"];
  userCollection: CollectionSlug;
};

/** Server-only plugin state exposed to custom Payload views through config.custom. */
export type RealizeAIServerRuntime = {
  canManageIntegrations: RealizeAIAccessResolver;
  integrationEncryptionKeyEnv: string;
};
