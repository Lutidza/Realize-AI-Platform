/**
 * @file packages/change-engine/src/system-ai/systemAIRelease.registry.ts
 * @version 1.1.7
 * @date 2026-10-23
 * @description Разрешает только встроенные владельцем exact system AI releases.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */
import type {
  SystemAIRelease,
  SystemAIReleaseReference,
} from "@realize/ai-contracts";
import published from "./releases/realize-system-1.1.9.generated.json";
import retainedOwnerRuntime from "./releases/realize-system-1.1.8.generated.json";
import retainedRuntime from "./releases/realize-system-1.1.7.generated.json";
import retainedVerification from "./releases/realize-system-1.1.6.generated.json";
import retainedGitRuntime from "./releases/realize-system-1.1.5.generated.json";
import retainedReadTools from "./releases/realize-system-1.1.4.generated.json";
import retainedGitHead from "./releases/realize-system-1.1.3.generated.json";
import retainedContext from "./releases/realize-system-1.1.2.generated.json";
import retainedPatch from "./releases/realize-system-1.1.1.generated.json";
import retainedUsage from "./releases/realize-system-1.1.0.generated.json";
import retained from "./releases/realize-system-1.0.0.generated.json";
import { hashCanonicalJSON } from "../canonicalJson";
import { AIConfigurationPolicyError } from "../aiConfigurationError";

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
};

const verify = (artifact: unknown): SystemAIRelease => {
  const release = structuredClone(artifact) as SystemAIRelease;
  const { manifestHash, ...payload } = release;
  if (hashCanonicalJSON(payload) !== manifestHash)
    throw new Error("Bundled system AI release failed integrity verification.");
  return freeze(release);
};
// Историческая policy явно сохраняется владельцем; текущий runtime продолжает применять metering.
const releases = [
  verify(published),
  verify(retainedOwnerRuntime),
  verify(retainedRuntime),
  verify(retainedVerification),
  verify(retainedGitRuntime),
  verify(retainedReadTools),
  verify(retainedGitHead),
  verify(retainedContext),
  verify(retainedPatch),
  verify(retainedUsage),
  verify(retained),
];

/** Trust root — этот owner-controlled module, а не hash, URL или клиентский файл. */
export const SYSTEM_AI_RELEASE = releases[0];
export const SYSTEM_AI_RELEASE_REFERENCE: SystemAIReleaseReference = freeze({
  releaseID: SYSTEM_AI_RELEASE.releaseID,
  manifestHash: SYSTEM_AI_RELEASE.manifestHash,
});

/** Нет latest fallback: прежний release должен явно оставаться в доверенном registry. */
export const requireSystemAIRelease = (value: unknown): SystemAIRelease => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "manifestHash,releaseID"
  )
    throw new AIConfigurationPolicyError(
      "Unknown or unavailable system AI release. Start a new run with a published release.",
    );
  const reference = value as SystemAIReleaseReference;
  const selected = releases.find(
    (release) =>
      release.releaseID === reference.releaseID &&
      release.manifestHash === reference.manifestHash,
  );
  if (!selected)
    throw new AIConfigurationPolicyError(
      "Unknown or unavailable system AI release. Start a new run with a published release.",
    );
  return selected;
};

export const buildSystemAIInstructions = (
  reference: SystemAIReleaseReference,
): string => {
  const selected = requireSystemAIRelease(reference);
  return [
    `System AI release: ${selected.releaseID} (${selected.manifestHash}).`,
    ...selected.instructions.map(
      (entry) => `\n${entry.id} (${entry.contentHash})\n${entry.text}`,
    ),
  ].join("\n");
};
