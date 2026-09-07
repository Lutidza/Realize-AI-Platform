/**
 * @file packages/ai-contracts/src/aiConfigurationArtifactInputValidation.ts
 * @version 2026-09-01
 * @description Строго разбирает typed artifacts installation configuration draft.
 * @docref Realize AI Commerce v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { AIConfigArtifact } from "./aiConfiguration";
import {
  parseEnum,
  parseInteger,
  parseStableKey,
  parseString,
  parseStringArray,
  requireExactKeys,
  strictObject,
} from "./aiConfigurationParsingSupport";
import {
  ARTIFACT_BASE_KEYS as BASE_KEYS,
  parseAgentProfileArtifact,
  parseArtifactBase as parseBase,
  parseCapabilityBindingArtifact,
} from "./aiConfigurationComplexArtifactParsing";
import { ContractValidationError } from "./validation";
import { parseWorkflowDefinition } from "./workflowInputValidation";

const ARTIFACT_KINDS = [
  "agent_profile",
  "capability_binding",
  "check_binding",
  "local_role",
  "local_rule",
  "prompt_template",
  "skill",
  "workflow_definition",
] as const;

const parseTextArray = (
  value: unknown,
  name: string,
  maximumItems: number,
  maximumLength: number,
): readonly string[] => {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new ContractValidationError(
      `${name} must contain at most ${maximumItems} items.`,
    );
  }
  return value.map((item, index) =>
    parseString(item, `${name}[${index}]`, maximumLength),
  );
};

/** Parses one discriminated artifact and rejects every unknown client field. */
export const parseAIConfigArtifact = (
  value: unknown,
  name = "artifact",
): AIConfigArtifact => {
  const input = strictObject(value, name);
  const kind = parseEnum(input.kind, ARTIFACT_KINDS, `${name}.kind`);
  if (kind === "workflow_definition") {
    return parseWorkflowDefinition(input, name);
  }
  if (kind === "agent_profile") return parseAgentProfileArtifact(input, name);
  if (kind === "capability_binding") {
    return parseCapabilityBindingArtifact(input, name);
  }
  if (kind === "check_binding") {
    requireExactKeys(
      input,
      [...BASE_KEYS, "checkID"],
      [...BASE_KEYS, "checkID"],
      name,
    );
    return {
      ...parseBase(input, kind, name),
      checkID: parseStableKey(input.checkID, `${name}.checkID`),
    };
  }
  if (kind === "local_role") {
    requireExactKeys(
      input,
      [...BASE_KEYS, "capabilityBindingKeys", "instructions"],
      [...BASE_KEYS, "capabilityBindingKeys", "instructions"],
      name,
    );
    return {
      ...parseBase(input, kind, name),
      capabilityBindingKeys: parseStringArray(
        input.capabilityBindingKeys,
        `${name}.capabilityBindingKeys`,
      ),
      instructions: parseString(
        input.instructions,
        `${name}.instructions`,
        16_000,
      ),
    };
  }
  if (kind === "local_rule") {
    requireExactKeys(
      input,
      [...BASE_KEYS, "instruction", "priority"],
      [...BASE_KEYS, "instruction", "priority"],
      name,
    );
    return {
      ...parseBase(input, kind, name),
      instruction: parseString(input.instruction, `${name}.instruction`, 8_000),
      priority: parseInteger(input.priority, `${name}.priority`, 0, 100),
    };
  }
  if (kind === "prompt_template") {
    requireExactKeys(
      input,
      [...BASE_KEYS, "slot", "template", "variables"],
      [...BASE_KEYS, "slot", "template", "variables"],
      name,
    );
    return {
      ...parseBase(input, kind, name),
      slot: parseEnum(
        input.slot,
        ["agent_instructions", "planner", "reviewer", "workflow_step"] as const,
        `${name}.slot`,
      ),
      template: parseString(input.template, `${name}.template`, 32_000),
      variables: parseStringArray(input.variables, `${name}.variables`),
    };
  }
  requireExactKeys(
    input,
    [
      ...BASE_KEYS,
      "capabilityBindingKeys",
      "description",
      "instructions",
      "triggerTerms",
    ],
    [
      ...BASE_KEYS,
      "capabilityBindingKeys",
      "description",
      "instructions",
      "triggerTerms",
    ],
    name,
  );
  return {
    ...parseBase(input, "skill", name),
    capabilityBindingKeys: parseStringArray(
      input.capabilityBindingKeys,
      `${name}.capabilityBindingKeys`,
    ),
    description: parseString(input.description, `${name}.description`, 2_000),
    instructions: parseString(
      input.instructions,
      `${name}.instructions`,
      16_000,
    ),
    triggerTerms: parseTextArray(
      input.triggerTerms,
      `${name}.triggerTerms`,
      128,
      120,
    ),
  };
};

/** Parses a bounded artifact aggregate and enforces `(kind,key)` uniqueness. */
export const parseAIConfigArtifacts = (
  value: unknown,
  name = "artifacts",
): readonly AIConfigArtifact[] => {
  if (!Array.isArray(value) || value.length > 512) {
    throw new ContractValidationError(
      `${name} must be an array with at most 512 artifacts.`,
    );
  }
  const identities = new Set<string>();
  return value.map((item, index) => {
    const artifact = parseAIConfigArtifact(item, `${name}[${index}]`);
    const identity = `${artifact.kind}:${artifact.key}`;
    if (identities.has(identity)) {
      throw new ContractValidationError(
        `${name} contains duplicate artifact: ${identity}.`,
      );
    }
    identities.add(identity);
    return artifact;
  });
};
