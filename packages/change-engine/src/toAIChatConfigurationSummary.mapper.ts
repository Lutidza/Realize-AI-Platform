/**
 * @file packages/change-engine/src/toAIChatConfigurationSummary.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Отображает проверенный закрытый снимок в явную публичную сводку запуска.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type {
  AIChatConfigurationSnapshot,
  AIChatConfigurationSummary,
} from "@realize/ai-contracts";

/** Использует allowlist: содержимое инструкций и capability bindings не выходит в RunDTO. */
export const toAIChatConfigurationSummary = (
  snapshot: AIChatConfigurationSnapshot,
): AIChatConfigurationSummary => ({
  releaseID: snapshot.compiled.configReleaseID,
  releaseVersion: snapshot.releaseVersion,
  manifestHash: snapshot.compiled.configManifestHash,
  profileKey: snapshot.compiled.profile.key,
  profileTitle: snapshot.compiled.profile.title,
  profileRevision: snapshot.compiled.profile.revision,
  compiledContextHash: snapshot.compiled.compiledContextHash,
  systemManifestHash: snapshot.compiled.systemManifestHash,
  systemReleaseID: snapshot.compiled.systemReleaseID,
  pointerVersion: snapshot.pointerVersion,
});
