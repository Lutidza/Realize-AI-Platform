/**
 * @file packages/change-engine/src/aiConfigurationArtifactValidation.ts
 * @version 2026-09-01
 * @description Проверяет локальные поля одного typed installation config artifact.
 * @docref Realize AI Commerce v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type {
  AIConfigArtifact,
  AIConfigValidationIssue,
} from "@realize/ai-contracts";

import { validateWorkflowDefinition } from "./workflowPolicy";

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const hasDuplicates = (values: readonly string[]): boolean =>
  new Set(values).size !== values.length;

const requireText = (
  value: string,
  path: string,
  issues: AIConfigValidationIssue[],
  maximum: number,
): void => {
  const length = value.trim().length;
  if (length < 1 || length > maximum) {
    issues.push({
      code: "config_text_invalid",
      message: `Text must contain between 1 and ${maximum} characters.`,
      path,
    });
  }
};

const validateStringList = (
  values: readonly string[],
  path: string,
  issues: AIConfigValidationIssue[],
): void => {
  if (hasDuplicates(values)) {
    issues.push({
      code: "config_list_duplicate",
      message: "List values must be unique.",
      path,
    });
  }
  values.forEach((value, index) => {
    if (!STABLE_KEY.test(value)) {
      issues.push({
        code: "config_reference_invalid",
        message: "Reference must be a stable key.",
        path: `${path}[${index}]`,
      });
    }
  });
};

/** Добавляет bounded schema issues одного artifact в общий validation report. */
export const validateAIConfigArtifact = (
  artifact: AIConfigArtifact,
  path: string,
  issues: AIConfigValidationIssue[],
): void => {
  if (!STABLE_KEY.test(artifact.key)) {
    issues.push({
      code: "config_artifact_key_invalid",
      message: "Artifact key is invalid.",
      path: `${path}.key`,
    });
  }
  if (!Number.isInteger(artifact.revision) || artifact.revision < 1) {
    issues.push({
      code: "config_artifact_revision_invalid",
      message: "Artifact revision must be a positive integer.",
      path: `${path}.revision`,
    });
  }
  requireText(artifact.title, `${path}.title`, issues, 120);

  switch (artifact.kind) {
    case "agent_profile":
      requireText(artifact.description, `${path}.description`, issues, 2_000);
      if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(artifact.locale)) {
        issues.push({
          code: "config_locale_invalid",
          message: "Agent profile locale is invalid.",
          path: `${path}.locale`,
        });
      }
      for (const [name, values] of [
        ["capabilityBindingKeys", artifact.capabilityBindingKeys],
        ["checkBindingKeys", artifact.checkBindingKeys],
        ["promptTemplateKeys", artifact.promptTemplateKeys],
        ["roleKeys", artifact.roleKeys],
        ["ruleKeys", artifact.ruleKeys],
        ["skillKeys", artifact.skillKeys],
        ["workflowKeys", artifact.workflowKeys],
      ] as const) {
        validateStringList(values, `${path}.${name}`, issues);
      }
      if (
        artifact.defaultWorkflowKey &&
        !artifact.workflowKeys.includes(artifact.defaultWorkflowKey)
      ) {
        issues.push({
          code: "config_default_workflow_not_selected",
          message: "defaultWorkflowKey must also be present in workflowKeys.",
          path: `${path}.defaultWorkflowKey`,
        });
      }
      break;
    case "capability_binding":
      if (
        !STABLE_KEY.test(artifact.capability.id) ||
        !/^\d+\.\d+(?:\.\d+)?$/.test(artifact.capability.version)
      ) {
        issues.push({
          code: "config_capability_reference_invalid",
          message: "Capability binding must use an exact valid id and version.",
          path: `${path}.capability`,
        });
      }
      validateStringList(
        artifact.allowedActions,
        `${path}.allowedActions`,
        issues,
      );
      if (artifact.allowedActions.length === 0) {
        issues.push({
          code: "config_capability_actions_empty",
          message: "Capability binding requires at least one allowed action.",
          path: `${path}.allowedActions`,
        });
      }
      if (
        artifact.maxTargets !== undefined &&
        (!Number.isInteger(artifact.maxTargets) || artifact.maxTargets < 1)
      ) {
        issues.push({
          code: "config_capability_limit_invalid",
          message: "maxTargets must be a positive integer.",
          path: `${path}.maxTargets`,
        });
      }
      validateStringList(
        artifact.readScopes || [],
        `${path}.readScopes`,
        issues,
      );
      validateStringList(
        artifact.writeScopes || [],
        `${path}.writeScopes`,
        issues,
      );
      break;
    case "check_binding":
      if (!STABLE_KEY.test(artifact.checkID)) {
        issues.push({
          code: "config_check_reference_invalid",
          message: "Check binding must reference a stable server check ID.",
          path: `${path}.checkID`,
        });
      }
      break;
    case "local_role":
      requireText(
        artifact.instructions,
        `${path}.instructions`,
        issues,
        16_000,
      );
      validateStringList(
        artifact.capabilityBindingKeys,
        `${path}.capabilityBindingKeys`,
        issues,
      );
      break;
    case "local_rule":
      requireText(artifact.instruction, `${path}.instruction`, issues, 8_000);
      if (
        !Number.isInteger(artifact.priority) ||
        artifact.priority < 0 ||
        artifact.priority > 100
      ) {
        issues.push({
          code: "config_rule_priority_invalid",
          message: "Rule priority must be an integer between 0 and 100.",
          path: `${path}.priority`,
        });
      }
      break;
    case "prompt_template": {
      requireText(artifact.template, `${path}.template`, issues, 32_000);
      validateStringList(artifact.variables, `${path}.variables`, issues);
      const declared = new Set(artifact.variables);
      const used = new Set(
        [...artifact.template.matchAll(/\{\{\s*([A-Za-z0-9._-]+)\s*\}\}/g)].map(
          (match) => match[1],
        ),
      );
      if (
        [...declared].some((variable) => !used.has(variable)) ||
        [...used].some((variable) => !declared.has(variable))
      ) {
        issues.push({
          code: "config_prompt_variables_mismatch",
          message: "Prompt variables must exactly match template placeholders.",
          path: `${path}.variables`,
        });
      }
      break;
    }
    case "skill":
      requireText(artifact.description, `${path}.description`, issues, 2_000);
      requireText(
        artifact.instructions,
        `${path}.instructions`,
        issues,
        16_000,
      );
      validateStringList(
        artifact.capabilityBindingKeys,
        `${path}.capabilityBindingKeys`,
        issues,
      );
      if (hasDuplicates(artifact.triggerTerms)) {
        issues.push({
          code: "config_skill_trigger_duplicate",
          message: "Skill trigger terms must be unique.",
          path: `${path}.triggerTerms`,
        });
      }
      artifact.triggerTerms.forEach((term, index) =>
        requireText(term, `${path}.triggerTerms[${index}]`, issues, 120),
      );
      break;
    case "workflow_definition":
      requireText(artifact.description, `${path}.description`, issues, 2_000);
      issues.push(...validateWorkflowDefinition(artifact, path));
      break;
  }
};
