/**
 * @file packages/change-engine/src/parseAIChatConfigurationSnapshot.validator.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет целостность закрытого снимка без повторной компиляции или выдачи полномочий.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */

import {
  parseAIChatConfigurationSnapshotShape,
  type AIChatConfigurationSnapshot,
  type AIConfigValidationIssue,
} from "@realize/ai-contracts";

import { validateAIConfigArtifact } from "./aiConfigurationArtifactValidation";
import { AIConfigurationPolicyError } from "./aiConfigurationError";
import { canonicalizeJSON, hashCanonicalJSON } from "./canonicalJson";
import { hashCompiledAgentConfiguration } from "./hashCompiledAgentConfiguration.util";

const requireSame = (
  actual: unknown,
  expected: unknown,
  name: string,
): void => {
  if (canonicalizeJSON(actual) !== canonicalizeJSON(expected)) {
    throw new AIConfigurationPolicyError(
      `${name} failed snapshot integrity verification.`,
    );
  }
};

const requireSortedUnique = (values: readonly string[], name: string): void =>
  requireSame(values, [...new Set(values)].sort(), name);

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
};

/**
 * Проверяет серверный transport/persistence snapshot и возвращает detached immutable value.
 * Хеши подтверждают целостность, а не происхождение: auth transport и текущий server policy
 * остаются обязательными; проверка не разрешает инструменты и не исполняет checks/workflows.
 */
export const parseAIChatConfigurationSnapshot = (
  value: unknown,
): AIChatConfigurationSnapshot => {
  const snapshot = parseAIChatConfigurationSnapshotShape(value);
  // Не допускаем скрытых runtime properties, которые обычный JSON.stringify пропускает.
  canonicalizeJSON(value);
  const { compiled } = snapshot;
  const identities = compiled.selectedArtifacts.map(
    ({ artifact }) => `${artifact.kind}:${artifact.key}`,
  );
  requireSortedUnique(identities, "selectedArtifacts identities");
  const issues: AIConfigValidationIssue[] = [];
  compiled.selectedArtifacts.forEach(({ artifact, contentHash }, index) => {
    if (!artifact.enabled) {
      throw new AIConfigurationPolicyError(
        "Selected snapshot artifact must be enabled.",
      );
    }
    validateAIConfigArtifact(artifact, `selectedArtifacts[${index}]`, issues);
    requireSame(
      contentHash,
      hashCanonicalJSON(artifact),
      "Artifact contentHash",
    );
  });
  if (issues.length > 0) {
    throw new AIConfigurationPolicyError(
      "Snapshot artifact validation failed.",
      issues,
    );
  }
  requireSame(
    compiled.selectedArtifactHashes,
    compiled.selectedArtifacts.map(({ contentHash }) => contentHash).sort(),
    "selectedArtifactHashes",
  );
  const selected = new Map(
    compiled.selectedArtifacts.map(({ artifact }) => [
      `${artifact.kind}:${artifact.key}`,
      artifact,
    ]),
  );
  const selectedProfile = selected.get(`agent_profile:${compiled.profile.key}`);
  if (!selectedProfile) {
    throw new AIConfigurationPolicyError(
      "Snapshot is missing its selected agent profile.",
    );
  }
  requireSame(compiled.profile, selectedProfile, "Compiled profile");
  for (const [kind, keys] of [
    ["capability_binding", compiled.profile.capabilityBindingKeys],
    ["check_binding", compiled.profile.checkBindingKeys],
    ["local_role", compiled.profile.roleKeys],
    ["local_rule", compiled.profile.ruleKeys],
    ["prompt_template", compiled.profile.promptTemplateKeys],
    ["skill", compiled.profile.skillKeys],
    ["workflow_definition", compiled.profile.workflowKeys],
  ] as const) {
    if (keys.some((key) => !selected.has(`${kind}:${key}`))) {
      throw new AIConfigurationPolicyError(
        `Snapshot is missing a selected ${kind} reference.`,
      );
    }
  }
  requireSortedUnique(compiled.checkIDs, "checkIDs");
  requireSortedUnique(
    compiled.capabilities.map(({ bindingKey }) => bindingKey),
    "capability binding keys",
  );
  for (const capability of compiled.capabilities) {
    requireSortedUnique(capability.actions, "capability actions");
    requireSortedUnique(capability.readScopes, "capability read scopes");
    requireSortedUnique(capability.writeScopes, "capability write scopes");
    const binding = selected.get(`capability_binding:${capability.bindingKey}`);
    if (binding?.kind !== "capability_binding") {
      throw new AIConfigurationPolicyError(
        "Snapshot capability binding is missing.",
      );
    }
    requireSame(
      capability.capability,
      binding.capability,
      "Capability reference",
    );
    requireSame(
      capability.actions,
      [...binding.allowedActions].sort(),
      "Capability actions",
    );
    if (binding.maxTargets !== undefined) {
      requireSame(
        capability.maxTargets,
        binding.maxTargets,
        "Capability maxTargets",
      );
    }
    if (binding.readScopes !== undefined) {
      requireSame(
        capability.readScopes,
        [...binding.readScopes].sort(),
        "Capability read scopes",
      );
    }
    if (binding.writeScopes !== undefined) {
      requireSame(
        capability.writeScopes,
        [...binding.writeScopes].sort(),
        "Capability write scopes",
      );
    }
  }
  requireSame(
    compiled.compiledContextHash,
    hashCompiledAgentConfiguration(compiled),
    "compiledContextHash",
  );
  return deepFreeze(snapshot);
};
