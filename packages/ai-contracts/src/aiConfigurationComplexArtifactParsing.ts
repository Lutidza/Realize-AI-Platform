/**
 * @file packages/ai-contracts/src/aiConfigurationComplexArtifactParsing.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Разбирает capability binding и agent profile config artifacts.
 * @docref Realize — AI Platform v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { AIConfigArtifact, AIConfigArtifactKind } from "./aiConfiguration";
import {
  parseBoolean,
  parseInteger,
  parseStableKey,
  parseString,
  parseStringArray,
  parseVersion,
  requireExactKeys,
  strictObject,
} from "./aiConfigurationParsingSupport";

export const ARTIFACT_BASE_KEYS = [
  "enabled",
  "key",
  "kind",
  "revision",
  "title",
] as const;

export const parseArtifactBase = <TKind extends AIConfigArtifactKind>(
  input: Record<string, unknown>,
  kind: TKind,
  name: string,
) => ({
  enabled: parseBoolean(input.enabled, `${name}.enabled`),
  key: parseStableKey(input.key, `${name}.key`),
  kind,
  revision: parseInteger(input.revision, `${name}.revision`, 1),
  title: parseString(input.title, `${name}.title`, 120),
});

export const parseCapabilityBindingArtifact = (
  input: Record<string, unknown>,
  name: string,
): AIConfigArtifact => {
  requireExactKeys(
    input,
    [
      ...ARTIFACT_BASE_KEYS,
      "allowedActions",
      "capability",
      "maxTargets",
      "readScopes",
      "writeScopes",
    ],
    [...ARTIFACT_BASE_KEYS, "allowedActions", "capability"],
    name,
  );
  const capability = strictObject(input.capability, `${name}.capability`);
  requireExactKeys(
    capability,
    ["id", "version"],
    ["id", "version"],
    `${name}.capability`,
  );
  return {
    ...parseArtifactBase(input, "capability_binding", name),
    allowedActions: parseStringArray(
      input.allowedActions,
      `${name}.allowedActions`,
    ),
    capability: {
      id: parseStableKey(capability.id, `${name}.capability.id`),
      version: parseVersion(capability.version, `${name}.capability.version`),
    },
    ...(input.maxTargets === undefined
      ? {}
      : {
          maxTargets: parseInteger(input.maxTargets, `${name}.maxTargets`, 1),
        }),
    ...(input.readScopes === undefined
      ? {}
      : {
          readScopes: parseStringArray(input.readScopes, `${name}.readScopes`),
        }),
    ...(input.writeScopes === undefined
      ? {}
      : {
          writeScopes: parseStringArray(
            input.writeScopes,
            `${name}.writeScopes`,
          ),
        }),
  };
};

export const parseAgentProfileArtifact = (
  input: Record<string, unknown>,
  name: string,
): AIConfigArtifact => {
  const referenceKeys = [
    "capabilityBindingKeys",
    "checkBindingKeys",
    "promptTemplateKeys",
    "roleKeys",
    "ruleKeys",
    "skillKeys",
    "workflowKeys",
  ] as const;
  requireExactKeys(
    input,
    [
      ...ARTIFACT_BASE_KEYS,
      "defaultWorkflowKey",
      "description",
      "locale",
      ...referenceKeys,
    ],
    [...ARTIFACT_BASE_KEYS, "description", "locale", ...referenceKeys],
    name,
  );
  return {
    ...parseArtifactBase(input, "agent_profile", name),
    capabilityBindingKeys: parseStringArray(
      input.capabilityBindingKeys,
      `${name}.capabilityBindingKeys`,
    ),
    checkBindingKeys: parseStringArray(
      input.checkBindingKeys,
      `${name}.checkBindingKeys`,
    ),
    ...(input.defaultWorkflowKey === undefined
      ? {}
      : {
          defaultWorkflowKey: parseStableKey(
            input.defaultWorkflowKey,
            `${name}.defaultWorkflowKey`,
          ),
        }),
    description: parseString(input.description, `${name}.description`, 2_000),
    locale: parseString(input.locale, `${name}.locale`, 16, 2),
    promptTemplateKeys: parseStringArray(
      input.promptTemplateKeys,
      `${name}.promptTemplateKeys`,
    ),
    roleKeys: parseStringArray(input.roleKeys, `${name}.roleKeys`),
    ruleKeys: parseStringArray(input.ruleKeys, `${name}.ruleKeys`),
    skillKeys: parseStringArray(input.skillKeys, `${name}.skillKeys`),
    workflowKeys: parseStringArray(input.workflowKeys, `${name}.workflowKeys`),
  };
};
