/**
 * @file packages/change-engine/src/aiConfigurationDraftPolicy.ts
 * @version 2026-09-01
 * @description Проверяет monotonic artifact revisions при полном draft replacement.
 * @docref Realize AI Commerce v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type {
  AIConfigArtifact,
  AIConfigDraft,
  AIConfigValidationIssue,
} from "@realize/ai-contracts";

import { AIConfigurationPolicyError } from "./aiConfigurationError";
import { hashCanonicalJSON } from "./canonicalJson";

const identity = (artifact: AIConfigArtifact): string =>
  `${artifact.kind}:${artifact.key}`;

const contentHashWithoutRevision = (artifact: AIConfigArtifact): string => {
  const { revision: _revision, ...content } = artifact;
  return hashCanonicalJSON(content);
};

/** Requires new=1, unchanged=same and changed=previous+1 artifact revisions. */
export const assertAIConfigArtifactRevisions = (input: {
  artifacts: readonly AIConfigArtifact[];
  current?: AIConfigDraft;
}): void => {
  const currentArtifacts = new Map(
    (input.current?.artifacts || []).map((artifact) => [
      identity(artifact),
      artifact,
    ]),
  );
  const issues: AIConfigValidationIssue[] = [];

  input.artifacts.forEach((artifact, index) => {
    const previous = currentArtifacts.get(identity(artifact));
    const expectedRevision = previous
      ? contentHashWithoutRevision(previous) ===
        contentHashWithoutRevision(artifact)
        ? previous.revision
        : previous.revision + 1
      : 1;
    if (artifact.revision !== expectedRevision) {
      issues.push({
        code: "config_artifact_revision_non_monotonic",
        message: `Artifact revision must equal ${expectedRevision}.`,
        path: `draft.artifacts[${index}].revision`,
      });
    }
  });

  if (issues.length > 0) {
    throw new AIConfigurationPolicyError(
      "AI configuration artifact revisions are invalid.",
      issues,
    );
  }
};
