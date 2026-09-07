/**
 * @file packages/change-engine/src/aiConfigurationSystemValidation.ts
 * @version 2026-09-01
 * @description Проверяет draft против exact system capability и check ceiling.
 * @docref Realize AI Commerce v1.0 — Интеграция системного и installation AI-layer
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */

import type {
  AIConfigDraft,
  AIConfigValidationIssue,
  AIConfigValidationResult,
  SystemAIConfigProjection,
} from "@realize/ai-contracts";

import { compileAgentConfiguration } from "./aiConfigurationCompiler";
import { AIConfigurationPolicyError } from "./aiConfigurationError";
import { createAIConfigRelease } from "./aiConfigurationRelease";
import { validateAIConfigDraft } from "./aiConfigurationValidation";

const VALIDATION_TIMESTAMP = "1970-01-01T00:00:00.000Z";

/** Validates schema/references and compiles every enabled profile in memory. */
export const validateAIConfigDraftForSystem = (input: {
  draft: AIConfigDraft;
  system: SystemAIConfigProjection;
}): AIConfigValidationResult => {
  const structural = validateAIConfigDraft(input.draft);
  if (!structural.valid) return structural;

  const candidate = createAIConfigRelease({
    createdAt: VALIDATION_TIMESTAMP,
    createdBy: "system-validator",
    draft: { ...input.draft, state: "ready" },
    releaseID: "validation-candidate",
    releaseVersion: 1,
    systemCompatibility: {
      maximumRelease: input.system.version,
      minimumRelease: input.system.version,
    },
  });
  const issues: AIConfigValidationIssue[] = [];
  input.draft.artifacts.forEach((artifact, index) => {
    if (artifact.kind !== "agent_profile" || !artifact.enabled) return;
    try {
      compileAgentConfiguration({
        profileKey: artifact.key,
        release: candidate,
        system: input.system,
      });
    } catch (error) {
      if (!(error instanceof AIConfigurationPolicyError)) throw error;
      issues.push({
        code: "config_system_policy_invalid",
        message: error.message,
        path: `draft.artifacts[${index}]`,
      });
    }
  });

  return issues.length > 0
    ? { issues, valid: false }
    : { issues: [] as const, valid: true };
};
