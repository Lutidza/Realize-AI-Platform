/**
 * @file packages/change-engine/src/aiConfigurationValidation.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет typed installation config и его внутренние references.
 * @docref Realize — AI Platform v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type {
  AIConfigArtifact,
  AIConfigArtifactKind,
  AIConfigDraft,
  AIConfigValidationIssue,
  AIConfigValidationResult,
} from "@realize/ai-contracts";

import { validateAIConfigArtifact } from "./aiConfigurationArtifactValidation";

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const identity = (kind: AIConfigArtifactKind, key: string): string =>
  `${kind}:${key}`;

/** Проверяет schema, uniqueness и cross-artifact references mutable draft. */
export const validateAIConfigDraft = (
  draft: AIConfigDraft,
): AIConfigValidationResult => {
  const issues: AIConfigValidationIssue[] = [];
  if (draft.schemaVersion !== "1.0") {
    issues.push({
      code: "config_schema_version_unsupported",
      message: "Draft schemaVersion is not supported.",
      path: "draft.schemaVersion",
    });
  }
  if (!["editing", "ready", "released", "validating"].includes(draft.state)) {
    issues.push({
      code: "config_draft_state_invalid",
      message: "Draft state is invalid.",
      path: "draft.state",
    });
  }
  if (!STABLE_KEY.test(draft.id)) {
    issues.push({
      code: "config_draft_id_invalid",
      message: "Draft id is invalid.",
      path: "draft.id",
    });
  }
  if (!Number.isInteger(draft.revision) || draft.revision < 1) {
    issues.push({
      code: "config_draft_revision_invalid",
      message: "Draft revision must be a positive integer.",
      path: "draft.revision",
    });
  }
  if (draft.artifacts.length > 512) {
    issues.push({
      code: "config_artifact_limit_exceeded",
      message: "Draft must not contain more than 512 artifacts.",
      path: "draft.artifacts",
    });
  }
  if (draft.baseRelease) {
    if (!STABLE_KEY.test(draft.baseRelease.id)) {
      issues.push({
        code: "config_base_release_id_invalid",
        message: "Base release id is invalid.",
        path: "draft.baseRelease.id",
      });
    }
    if (!SHA256.test(draft.baseRelease.manifestHash)) {
      issues.push({
        code: "config_base_release_hash_invalid",
        message: "Base release manifestHash must be a SHA-256 hash.",
        path: "draft.baseRelease.manifestHash",
      });
    }
  }

  const byIdentity = new Map<string, AIConfigArtifact>();
  draft.artifacts.forEach((artifact, index) => {
    const path = `draft.artifacts[${index}]`;
    validateAIConfigArtifact(artifact, path, issues);
    const key = identity(artifact.kind, artifact.key);
    if (byIdentity.has(key)) {
      issues.push({
        code: "config_artifact_duplicate",
        message: `Duplicate config artifact: ${key}.`,
        path,
      });
    } else {
      byIdentity.set(key, artifact);
    }
  });

  const requireReference = (
    kind: AIConfigArtifactKind,
    key: string,
    path: string,
    sourceEnabled: boolean,
  ): void => {
    const target = byIdentity.get(identity(kind, key));
    if (!target) {
      issues.push({
        code: "config_reference_missing",
        message: `Referenced ${kind} does not exist: ${key}.`,
        path,
      });
    } else if (sourceEnabled && !target.enabled) {
      issues.push({
        code: "config_reference_disabled",
        message: `Enabled artifact references disabled ${kind}: ${key}.`,
        path,
      });
    }
  };

  draft.artifacts.forEach((artifact, index) => {
    const path = `draft.artifacts[${index}]`;
    if (artifact.kind === "agent_profile") {
      for (const [kind, name, keys] of [
        [
          "capability_binding",
          "capabilityBindingKeys",
          artifact.capabilityBindingKeys,
        ],
        ["check_binding", "checkBindingKeys", artifact.checkBindingKeys],
        ["prompt_template", "promptTemplateKeys", artifact.promptTemplateKeys],
        ["local_role", "roleKeys", artifact.roleKeys],
        ["local_rule", "ruleKeys", artifact.ruleKeys],
        ["skill", "skillKeys", artifact.skillKeys],
        ["workflow_definition", "workflowKeys", artifact.workflowKeys],
      ] as const) {
        keys.forEach((key, keyIndex) =>
          requireReference(
            kind,
            key,
            `${path}.${name}[${keyIndex}]`,
            artifact.enabled,
          ),
        );
      }
    }
    if (artifact.kind === "local_role" || artifact.kind === "skill") {
      artifact.capabilityBindingKeys.forEach((key, keyIndex) =>
        requireReference(
          "capability_binding",
          key,
          `${path}.capabilityBindingKeys[${keyIndex}]`,
          artifact.enabled,
        ),
      );
    }
    if (artifact.kind === "workflow_definition") {
      artifact.steps.forEach((step, stepIndex) => {
        const stepPath = `${path}.steps[${stepIndex}]`;
        if (step.type === "agent_turn" || step.type === "request_input") {
          requireReference(
            "prompt_template",
            step.promptTemplateKey,
            `${stepPath}.promptTemplateKey`,
            artifact.enabled,
          );
        } else if (step.type === "capability") {
          requireReference(
            "capability_binding",
            step.capabilityBindingKey,
            `${stepPath}.capabilityBindingKey`,
            artifact.enabled,
          );
        } else if (step.type === "check") {
          requireReference(
            "check_binding",
            step.checkBindingKey,
            `${stepPath}.checkBindingKey`,
            artifact.enabled,
          );
        }
      });
    }
  });

  if (
    !draft.artifacts.some(
      (artifact) => artifact.kind === "agent_profile" && artifact.enabled,
    )
  ) {
    issues.push({
      code: "config_agent_profile_missing",
      message: "Draft requires at least one enabled agent profile.",
      path: "draft.artifacts",
    });
  }

  return issues.length > 0
    ? { issues, valid: false }
    : { issues: [] as const, valid: true };
};
