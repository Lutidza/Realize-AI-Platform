/**
 * @file packages/change-engine/src/systemCapabilityRegistry.ts
 * @version 1.3.0
 * @date 2026-10-04
 * @description Даёт compiler и Data Lane registry из доверенного системного artifact.
 */
import type { SystemAIConfigProjection } from "@realize/ai-contracts";
import { createCapabilityRegistry } from "./capabilityRegistry";
import { SYSTEM_AI_RELEASE } from "./system-ai/systemAIRelease.registry";

export const SYSTEM_CHECK_IDS = SYSTEM_AI_RELEASE.checkIDs;

/** Неизменяемый серверный registry; точная версия выбирается без latest fallback. */
export const SYSTEM_CAPABILITY_REGISTRY = createCapabilityRegistry(
  SYSTEM_AI_RELEASE.capabilities,
);

/** Неизменяемый profile adapter каталога из system registry. */
export const CATALOG_ASSIGN_CATEGORY_CAPABILITY =
  SYSTEM_CAPABILITY_REGISTRY.require({
    id: "catalog.assignCategory.v1",
    version: "1.0",
  });

/** Точная версия реализованного adapter создания черновика; публикация не входит в ceiling. */
export const PAGES_CREATE_DRAFT_CAPABILITY = SYSTEM_CAPABILITY_REGISTRY.require(
  { id: "pages.createDraft.v1", version: "1.0" },
);

/** Ceiling связан с полным системным release, включая инструкции и protected policy. */
export const SYSTEM_AI_CONFIG_PROJECTION: SystemAIConfigProjection =
  Object.freeze({
    capabilities: SYSTEM_AI_RELEASE.capabilities,
    checkIDs: SYSTEM_CHECK_IDS,
    projectProfile: SYSTEM_AI_RELEASE.projectProfile,
    releaseID: SYSTEM_AI_RELEASE.releaseID,
    version: SYSTEM_AI_RELEASE.version,
    manifestHash: SYSTEM_AI_RELEASE.manifestHash,
  });
