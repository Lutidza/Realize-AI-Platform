/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigHandlerSupport.ts
 * @version 2026-09-01
 * @description Связывает pure config policy с безопасными endpoint conflicts/errors.
 * @docref Realize AI Commerce v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type {
  AIConfigArtifact,
  AIConfigBaseReleaseDTO,
  AIConfigDraft,
  AIConfigValidationIssue,
} from "@realize/ai-contracts";
import {
  AIConfigurationPolicyError,
  assertAIConfigArtifactRevisions,
  hashCanonicalJSON,
} from "@realize/change-engine";

import { toAIConfigReleaseDTO } from "./aiConfigReleaseMapper";
import type { AIConfigEventAction } from "./aiConfigRepository";
import { AIConfigRepository } from "./aiConfigRepository";
import { EndpointError } from "./http";

export const configRequestHash = (
  action: AIConfigEventAction,
  value: unknown,
): string => hashCanonicalJSON({ action, value });

export const configResponseSnapshot = (
  value: object,
): Record<string, unknown> =>
  structuredClone(value) as unknown as Record<string, unknown>;

export const requireBaseRelease = async (
  repository: AIConfigRepository,
  reference: AIConfigBaseReleaseDTO | null,
): Promise<void> => {
  if (!reference) return;
  const release = toAIConfigReleaseDTO(
    await repository.requireRelease(reference.id),
  );
  if (release.manifestHash !== reference.manifestHash) {
    throw new EndpointError(
      "CONFLICT",
      "Base AI configuration release hash changed or is invalid.",
      409,
    );
  }
};

export const requireDraftRevision = (
  draft: AIConfigDraft,
  expectedRevision: number,
  expectedState?: AIConfigDraft["state"],
): void => {
  if (
    draft.revision !== expectedRevision ||
    (expectedState !== undefined && draft.state !== expectedState)
  ) {
    throw new EndpointError(
      "CONFLICT",
      "AI configuration draft changed. Reload before continuing.",
      409,
    );
  }
};

export const requireArtifactRevisions = (input: {
  artifacts: readonly AIConfigArtifact[];
  current?: AIConfigDraft;
}): void => {
  try {
    assertAIConfigArtifactRevisions(input);
  } catch (error) {
    if (error instanceof AIConfigurationPolicyError) {
      throw new EndpointError("INVALID_REQUEST", error.message, 400, {
        issues: error.issues,
      });
    }
    throw error;
  }
};

/** Caps hostile validation fan-out while retaining an explicit truncation issue. */
export const boundedValidationIssues = (
  issues: readonly AIConfigValidationIssue[],
): readonly AIConfigValidationIssue[] => {
  if (issues.length <= 512) return issues;
  return [
    ...issues.slice(0, 511),
    {
      code: "config_issue_limit_exceeded",
      message: "Additional validation issues were omitted.",
      path: "draft",
    },
  ];
};
