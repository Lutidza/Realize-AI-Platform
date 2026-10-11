/**
 * @file packages/change-engine/src/system-ai/assertRuntimeAIConfiguration.validator.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Сверяет целостный admin snapshot с доверенным server-owned ceiling.
 */
import type {
  AIChatConfigurationSnapshot,
  SystemAIReleaseReference,
} from "@realize/ai-contracts";
import { parseAIChatConfigurationSnapshot } from "../parseAIChatConfigurationSnapshot.validator";
import { AIConfigurationPolicyError } from "../aiConfigurationError";
import { requireSystemAIRelease } from "./systemAIRelease.registry";

/** Hash подтверждает целостность, но не даёт клиенту право определять system policy. */
export const assertRuntimeAIConfiguration = (
  reference: SystemAIReleaseReference,
  value: unknown,
): AIChatConfigurationSnapshot | undefined => {
  const system = requireSystemAIRelease(reference);
  if (value === undefined) return undefined;
  const snapshot = parseAIChatConfigurationSnapshot(value);
  const compiled = snapshot.compiled;
  const reject = () => {
    throw new AIConfigurationPolicyError(
      "Configuration exceeds or does not match the trusted system AI release.",
    );
  };
  if (
    compiled.systemReleaseID !== system.releaseID ||
    compiled.systemManifestHash !== system.manifestHash ||
    compiled.systemVersion !== system.version ||
    compiled.projectProfile !== system.projectProfile ||
    compiled.checkIDs.some((id) => !system.checkIDs.includes(id))
  )
    reject();
  for (const binding of compiled.capabilities) {
    const capability = system.capabilities.find(
      (entry) =>
        entry.id === binding.capability.id &&
        entry.version === binding.capability.version,
    );
    if (
      !capability ||
      !capability.projectProfiles.includes(system.projectProfile) ||
      binding.maxTargets > capability.limits.maxTargets ||
      binding.actions.some((value) => !capability.actions.includes(value)) ||
      binding.readScopes.some(
        (value) => !capability.scopes.read.includes(value),
      ) ||
      binding.writeScopes.some(
        (value) => !capability.scopes.write.includes(value),
      ) ||
      capability.requiredCheckIDs.some((id) => !compiled.checkIDs.includes(id))
    )
      reject();
  }
  return snapshot;
};
