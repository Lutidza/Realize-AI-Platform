/**
 * @file packages/payload-ai-plugin/src/endpoints/previewAcceptanceGuard.ts
 * @version 2026-08-28
 * @description Проверяет cryptographic binding accepted preview перед downstream promotion.
 */

import { createPreviewAcceptanceBinding } from "@realize/change-engine";

import { EndpointError } from "./http";
import { relationID } from "./mappers";

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

/** Fail-closed проверяет, что approval относится к exact preview artifact. */
export const requireAcceptedPreviewBinding = (input: {
  acceptance: Record<string, unknown>;
  changeRequestID: string;
  deployment: Record<string, unknown>;
  expectedVersion: number;
}): void => {
  const decisionKey = String(input.acceptance.decisionKey || "");
  const decisionMatch = decisionKey.match(
    new RegExp(
      `^${input.changeRequestID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:(\\d+):PREVIEW_ACCEPTANCE$`,
    ),
  );
  const acceptedVersion = decisionMatch
    ? Number(decisionMatch[1])
    : input.expectedVersion - 1;
  if (acceptedVersion < 1) {
    throw new EndpointError("CONFLICT", "Accepted version is invalid.", 409);
  }
  const expected = createPreviewAcceptanceBinding({
    actorID: relationID(input.acceptance.actor),
    actorRoles: strings(input.acceptance.roleSnapshot),
    artifactHash: String(input.deployment.artifactHash || ""),
    changeRequestID: input.changeRequestID,
    commitSHA: String(input.deployment.commitSHA || ""),
    decision: "approved",
    environment: "local-preview",
    evidenceHash: String(input.deployment.evidenceHash || ""),
    expiresAt: String(input.acceptance.expiresAt || ""),
    reviewerEvidenceHash: String(input.deployment.reviewEvidenceHash || ""),
    sourceDiffHash: String(input.deployment.sourceDiffHash || ""),
    version: acceptedVersion,
  });
  if (
    input.acceptance.decision !== "approved" ||
    input.acceptance.artifactHash !== input.deployment.artifactHash ||
    input.acceptance.boundHash !== expected
  ) {
    throw new EndpointError(
      "CONFLICT",
      "Stored preview acceptance is not bound to this exact artifact.",
      409,
    );
  }
};
