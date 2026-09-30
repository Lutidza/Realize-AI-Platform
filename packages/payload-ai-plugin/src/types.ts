/**
 * @file packages/payload-ai-plugin/src/types.ts
 * @version 1.5.0
 * @date 2026-09-25
 * @description Задаёт public plugin options для AI config, delivery и integrations.
 */

import type { PageDraftAdapter } from "./endpoints/PageDraft.types";
import type { RuntimeStatusDTO } from "@realize/ai-contracts";
import type { CollectionSlug, PayloadRequest } from "payload";

/** Installation-owned authorization callback на основе Payload request. */
export type RealizeAIAccessResolver = (args: {
  req: PayloadRequest;
}) => boolean | Promise<boolean>;

/** Публичные options Realize AI Payload config transformer. */
export type RealizeAIPluginOptions = {
  access: {
    canApproveRelease: RealizeAIAccessResolver;
    canManageAIConfiguration: RealizeAIAccessResolver;
    canManageData: RealizeAIAccessResolver;
    /** Явное право на личные drafts Мастерской; отсутствие означает запрет. */
    canManageDesignWorkshop?: RealizeAIAccessResolver;
    /** Отдельное разрешение на sandbox capture; отсутствие означает запрет. */
    canPreviewDesignWorkshop?: RealizeAIAccessResolver;
    canManageIntegrations: RealizeAIAccessResolver;
    canUseChat: RealizeAIAccessResolver;
    canViewRuns: RealizeAIAccessResolver;
  };
  admin?: {
    group?: string;
    integrationsRoute?: `/${string}`;
    mcpServersRoute?: `/${string}`;
    route?: `/${string}`;
  };
  enabled?: boolean;
  pageDraft?: PageDraftAdapter;
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
    /** Техническая изоляция проверок и preview запрещает новый runtime независимо от интеграции. */
    isolated?: boolean;
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
    mcpServersRoute: `/${string}`;
    route: `/${string}`;
  };
  enabled: boolean;
  pageDraft?: PageDraftAdapter;
  runtimeStatus?: RuntimeStatusDTO;
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

/** Server-only состояние плагина для Payload views и адаптеров через config.custom. */
export type RealizeAIServerRuntime = {
  userCollection?: CollectionSlug;
  pageDraft?: PageDraftAdapter;
  canUseChat: RealizeAIAccessResolver;
  canManageData: RealizeAIAccessResolver;
  canManageAIConfiguration: RealizeAIAccessResolver;
  canManageIntegrations: RealizeAIAccessResolver;
  canManageDesignWorkshop?: RealizeAIAccessResolver;
  canPreviewDesignWorkshop?: RealizeAIAccessResolver;
  integrationEncryptionKeyEnv: string;
};
