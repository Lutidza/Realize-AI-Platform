/**
 * @file packages/change-engine/src/aiConfigurationCompiler.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Компилирует exact agent profile как пересечение system и installation policy.
 * @docref Realize AI Commerce v1.0 — Интеграция системного и installation AI-layer
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */

import type {
  AICapabilityBindingDefinition,
  AIConfigArtifact,
  AIConfigArtifactKind,
  AIConfigArtifactSnapshot,
  AIConfigRelease,
  CompiledAgentConfiguration,
  ResolvedCapabilityBinding,
  SystemAIConfigProjection,
} from "@realize/ai-contracts";

import { AIConfigurationPolicyError } from "./aiConfigurationError";
import { verifyAIConfigRelease } from "./aiConfigurationRelease";
import { createCapabilityRegistry } from "./capabilityRegistry";
import { hashCompiledAgentConfiguration } from "./hashCompiledAgentConfiguration.util";

const SHA256 = /^[a-f0-9]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const VERSION = /^\d+\.\d+(?:\.\d+)?$/;

type ArtifactOf<TKind extends AIConfigArtifactKind> = Extract<
  AIConfigArtifact,
  { kind: TKind }
>;

const artifactIdentity = (kind: AIConfigArtifactKind, key: string): string =>
  `${kind}:${key}`;

const compareVersions = (left: string, right: string): number => {
  const parse = (value: string): readonly number[] =>
    value.split(".").map((part) => Number(part));
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

const requireSubset = (
  requested: readonly string[] | undefined,
  ceiling: readonly string[],
  name: string,
): readonly string[] => {
  const effective = requested === undefined ? ceiling : requested;
  const allowed = new Set(ceiling);
  const expanded = effective.find((value) => !allowed.has(value));
  if (expanded) {
    throw new AIConfigurationPolicyError(
      `${name} expands the system capability ceiling: ${expanded}.`,
    );
  }
  return [...new Set(effective)].sort();
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
};

/** Собирает immutable agent projection и связывает её с exact release hashes. */
export const compileAgentConfiguration = (input: {
  profileKey: string;
  release: AIConfigRelease;
  system: SystemAIConfigProjection;
}): CompiledAgentConfiguration => {
  if (!verifyAIConfigRelease(input.release)) {
    throw new AIConfigurationPolicyError(
      "AI configuration release failed manifest verification.",
    );
  }
  if (!SHA256.test(input.system.manifestHash)) {
    throw new AIConfigurationPolicyError(
      "System manifestHash must be a SHA-256 hash.",
    );
  }
  if (
    !VERSION.test(input.system.version) ||
    !STABLE_ID.test(input.system.releaseID) ||
    !STABLE_ID.test(input.system.projectProfile)
  ) {
    throw new AIConfigurationPolicyError(
      "System release, version or project profile is invalid.",
    );
  }
  const { maximumRelease, minimumRelease } = input.release.systemCompatibility;
  if (
    compareVersions(input.system.version, minimumRelease) < 0 ||
    (maximumRelease &&
      compareVersions(input.system.version, maximumRelease) > 0)
  ) {
    throw new AIConfigurationPolicyError(
      "AI configuration release is incompatible with the system release.",
    );
  }

  const registry = createCapabilityRegistry(input.system.capabilities);
  if (
    new Set(input.system.checkIDs).size !== input.system.checkIDs.length ||
    input.system.checkIDs.some((checkID) => !STABLE_ID.test(checkID))
  ) {
    throw new AIConfigurationPolicyError(
      "System check registry contains invalid or duplicate IDs.",
    );
  }
  const systemCheckIDs = new Set(input.system.checkIDs);
  const snapshots = new Map(
    input.release.artifacts.map((snapshot) => [
      artifactIdentity(snapshot.artifact.kind, snapshot.artifact.key),
      snapshot,
    ]),
  );
  const selected = new Map<string, AIConfigArtifactSnapshot>();

  const requireArtifact = <TKind extends AIConfigArtifactKind>(
    kind: TKind,
    key: string,
  ): ArtifactOf<TKind> => {
    const snapshot = snapshots.get(artifactIdentity(kind, key));
    if (!snapshot || !snapshot.artifact.enabled) {
      throw new AIConfigurationPolicyError(
        `Enabled configuration artifact is unavailable: ${kind}:${key}.`,
      );
    }
    selected.set(artifactIdentity(kind, key), snapshot);
    return snapshot.artifact as ArtifactOf<TKind>;
  };

  const profile = requireArtifact("agent_profile", input.profileKey);
  profile.promptTemplateKeys.forEach((key) =>
    requireArtifact("prompt_template", key),
  );
  profile.ruleKeys.forEach((key) => requireArtifact("local_rule", key));
  const roles = profile.roleKeys.map((key) =>
    requireArtifact("local_role", key),
  );
  const skills = profile.skillKeys.map((key) => requireArtifact("skill", key));
  const workflows = profile.workflowKeys.map((key) =>
    requireArtifact("workflow_definition", key),
  );

  const capabilityBindingKeys = new Set(profile.capabilityBindingKeys);
  roles.forEach((role) =>
    role.capabilityBindingKeys.forEach((key) => capabilityBindingKeys.add(key)),
  );
  skills.forEach((skill) =>
    skill.capabilityBindingKeys.forEach((key) =>
      capabilityBindingKeys.add(key),
    ),
  );
  workflows.forEach((workflow) =>
    workflow.steps.forEach((step) => {
      if (step.type === "agent_turn" || step.type === "request_input") {
        requireArtifact("prompt_template", step.promptTemplateKey);
      } else if (step.type === "capability") {
        capabilityBindingKeys.add(step.capabilityBindingKey);
      }
    }),
  );

  const checkBindingKeys = new Set(profile.checkBindingKeys);
  workflows.forEach((workflow) =>
    workflow.steps.forEach((step) => {
      if (step.type === "check") checkBindingKeys.add(step.checkBindingKey);
    }),
  );
  const requiredCheckIDs = new Set<string>();

  const resolveCapability = (
    binding: AICapabilityBindingDefinition,
  ): ResolvedCapabilityBinding => {
    const descriptor = registry.get(binding.capability);
    if (!descriptor) {
      throw new AIConfigurationPolicyError(
        `Capability is not registered: ${binding.capability.id}@${binding.capability.version}.`,
      );
    }
    if (!descriptor.projectProfiles.includes(input.system.projectProfile)) {
      throw new AIConfigurationPolicyError(
        `Capability is not available for profile: ${input.system.projectProfile}.`,
      );
    }
    descriptor.requiredCheckIDs.forEach((checkID) =>
      requiredCheckIDs.add(checkID),
    );
    const maxTargets = binding.maxTargets ?? descriptor.limits.maxTargets;
    if (maxTargets > descriptor.limits.maxTargets) {
      throw new AIConfigurationPolicyError(
        `Capability binding expands maxTargets: ${binding.key}.`,
      );
    }
    return {
      actions: requireSubset(
        binding.allowedActions,
        descriptor.actions,
        `${binding.key} actions`,
      ),
      bindingKey: binding.key,
      capability: binding.capability,
      maxTargets,
      readScopes: requireSubset(
        binding.readScopes,
        descriptor.scopes.read,
        `${binding.key} read scopes`,
      ),
      writeScopes: requireSubset(
        binding.writeScopes,
        descriptor.scopes.write,
        `${binding.key} write scopes`,
      ),
    };
  };

  const capabilities = [...capabilityBindingKeys]
    .sort()
    .map((key) =>
      resolveCapability(requireArtifact("capability_binding", key)),
    );
  const configuredCheckIDs = [...checkBindingKeys]
    .sort()
    .map((key) => requireArtifact("check_binding", key).checkID);
  const checkIDs = [
    ...new Set([...configuredCheckIDs, ...requiredCheckIDs]),
  ].sort();
  const missingCheck = checkIDs.find((checkID) => !systemCheckIDs.has(checkID));
  if (missingCheck) {
    throw new AIConfigurationPolicyError(
      `Check is not registered by the system: ${missingCheck}.`,
    );
  }

  const selectedArtifacts = [...selected.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, snapshot]) => snapshot);
  const selectedArtifactHashes = selectedArtifacts
    .map((snapshot) => snapshot.contentHash)
    .sort();
  const compiledContextHash = hashCompiledAgentConfiguration({
    capabilities,
    checkIDs,
    configManifestHash: input.release.manifestHash,
    configReleaseID: input.release.id,
    profile,
    projectProfile: input.system.projectProfile,
    selectedArtifactHashes,
    systemManifestHash: input.system.manifestHash,
    systemReleaseID: input.system.releaseID,
    systemVersion: input.system.version,
  });

  return deepFreeze(
    structuredClone({
      capabilities,
      checkIDs,
      compiledContextHash,
      configManifestHash: input.release.manifestHash,
      configReleaseID: input.release.id,
      profile,
      projectProfile: input.system.projectProfile,
      selectedArtifacts,
      selectedArtifactHashes,
      systemManifestHash: input.system.manifestHash,
      systemReleaseID: input.system.releaseID,
      systemVersion: input.system.version,
    }),
  );
};
