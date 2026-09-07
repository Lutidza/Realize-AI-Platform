/**
 * @file packages/change-engine/src/systemCapabilityRegistry.ts
 * @version 2026-09-01
 * @description Регистрирует текущие system capabilities и stable check IDs.
 * @docref Realize AI Commerce v1.0 — Change Engine
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/11-change-engine.md
 */

import type {
  CapabilityDescriptor,
  SystemAIConfigProjection,
} from "@realize/ai-contracts";

import { createCapabilityRegistry } from "./capabilityRegistry";
import { hashCanonicalJSON } from "./canonicalJson";

/** Stable IDs фактических проверок первого Payload Data Lane. */
export const SYSTEM_CHECK_IDS = Object.freeze([
  "payload.access",
  "payload.audit",
  "payload.optimisticLock",
  "payload.selector.unique",
]);

const CATALOG_ASSIGN_CATEGORY_SOURCE = {
  actions: ["category.assign"],
  approvals: ["write_confirmation", "rollback_confirmation"],
  capabilityClass: "data",
  description:
    "Добавляет одну существующую категорию одному существующему товару через Payload Data Lane.",
  executor: {
    id: "catalog.assignCategory.executor",
    version: "1.0",
  },
  id: "catalog.assignCategory.v1",
  inputSchema: {
    id: "catalog.assignCategory.input",
    version: "1.0",
  },
  limits: { maxBatchSize: 1, maxTargets: 1 },
  projectProfiles: ["e-commerce"],
  requiredCheckIDs: SYSTEM_CHECK_IDS,
  resolver: {
    id: "catalog.assignCategory.resolver",
    version: "1.0",
  },
  riskLevel: "R1",
  riskSignals: ["existing-resources", "single-target"],
  scopes: {
    protectedResources: "deny",
    read: ["payload.categories", "payload.products"],
    write: ["payload.products.categories"],
  },
  support: {
    dryRun: true,
    idempotency: true,
    preview: false,
    rollback: true,
  },
  title: "Назначение категории товару",
  version: "1.0",
} satisfies CapabilityDescriptor;

/** Immutable server registry; exact version lookup не использует latest fallback. */
export const SYSTEM_CAPABILITY_REGISTRY = createCapabilityRegistry([
  CATALOG_ASSIGN_CATEGORY_SOURCE,
]);

/** Первый глубоко immutable profile adapter из system registry. */
export const CATALOG_ASSIGN_CATEGORY_CAPABILITY =
  SYSTEM_CAPABILITY_REGISTRY.require({
    id: "catalog.assignCategory.v1",
    version: "1.0",
  });

const systemProjectionPayload = {
  capabilities: SYSTEM_CAPABILITY_REGISTRY.list(),
  checkIDs: SYSTEM_CHECK_IDS,
  projectProfile: "e-commerce",
  releaseID: "realize-e-commerce-system-v1",
  version: "1.0.0",
} as const;

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
};

/** Exact server ceiling used by config validation, release and future runtime binding. */
export const SYSTEM_AI_CONFIG_PROJECTION: SystemAIConfigProjection = deepFreeze(
  structuredClone({
    ...systemProjectionPayload,
    manifestHash: hashCanonicalJSON(systemProjectionPayload),
  }),
);
