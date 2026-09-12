/**
 * @file packages/change-engine/src/hashCompiledAgentConfiguration.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Вычисляет единый content hash компилятора и сохранённого контекста агента.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */

import type { CompiledAgentConfiguration } from "@realize/ai-contracts";

import { hashCanonicalJSON } from "./canonicalJson";

/** Сохраняет исходную формулу compiler; policy/model fingerprint принадлежит runtime. */
export const hashCompiledAgentConfiguration = (
  compiled: Omit<
    CompiledAgentConfiguration,
    "compiledContextHash" | "selectedArtifacts"
  >,
): string =>
  hashCanonicalJSON({
    capabilities: compiled.capabilities,
    checkIDs: compiled.checkIDs,
    configManifestHash: compiled.configManifestHash,
    configReleaseID: compiled.configReleaseID,
    profile: { key: compiled.profile.key, revision: compiled.profile.revision },
    projectProfile: compiled.projectProfile,
    selectedArtifactHashes: compiled.selectedArtifactHashes,
    systemManifestHash: compiled.systemManifestHash,
    systemReleaseID: compiled.systemReleaseID,
    systemVersion: compiled.systemVersion,
  });
