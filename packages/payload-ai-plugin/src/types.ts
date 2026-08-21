/**
 * @file packages/payload-ai-plugin/src/types.ts
 * @version 2026-08-21
 * @description Defines the public configuration contract for the Payload AI plugin transformer.
 */

import type { CollectionSlug, PayloadRequest } from "payload";

/** Installation-owned authorization callback evaluated with a Payload request. */
export type RealizeAIAccessResolver = (args: {
  req: PayloadRequest;
}) => boolean | Promise<boolean>;

/** Public options accepted by the Realize AI Payload config transformer. */
export type RealizeAIPluginOptions = {
  access: {
    canUseChat: RealizeAIAccessResolver;
    canViewRuns: RealizeAIAccessResolver;
  };
  admin?: {
    group?: string;
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
  preview?: {
    enabled?: boolean;
    ttlSeconds?: number;
  };
  runtime: {
    controlPlaneTokenEnv: string;
    controlPlaneURL?: string;
    mode: "central-control-plane" | "local-development";
    model?: string;
  };
  userCollection?: CollectionSlug;
};

/** Normalized internal options after defaults and boundary validation. */
export type SanitizedRealizeAIPluginOptions = {
  access: RealizeAIPluginOptions["access"];
  admin: {
    group: string;
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
  preview: {
    enabled: boolean;
    ttlSeconds: number;
  };
  runtime: RealizeAIPluginOptions["runtime"];
  userCollection: CollectionSlug;
};
