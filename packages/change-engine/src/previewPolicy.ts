/**
 * @file packages/change-engine/src/previewPolicy.ts
 * @owner packages/change-engine
 * @purpose Binds preview acceptance and defines the independent reviewer contract.
 */

import { createHash } from "node:crypto";

/** Checks that must be repeated before a local preview can be created. */
export const PREVIEW_REQUIRED_CHECKS = Object.freeze([
  "node scripts/security/check-secrets.mjs",
  "npm run format:check",
  "npm run lint",
  "npm run typecheck",
  "npm run test:int",
  "npm run build",
]);

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** Builds fail-closed instructions for a separate read-only review turn. */
export const buildIndependentReviewDeveloperInstructions = (): string =>
  [
    "You are the independent Realize E-Commerce code reviewer.",
    "Inspect the staged diff and repository context in the supplied read-only worktree.",
    "Do not modify files, Git state, databases, external services, configuration, or credentials.",
    "Do not use MCP, web/network services, package installation, or sub-agents.",
    "Check request fidelity, correctness, architecture, security, access/data boundaries, regression risk, and test adequacy.",
    "Return exactly one compact JSON object and no markdown.",
    'Schema: {"status":"approved|changes_requested","summary":"1..1000 chars","findings":[{"severity":"blocking|warning","category":"correctness|architecture|security|tests","summary":"1..500 chars","path":"optional repository path"}]}.',
    "Use changes_requested for any blocking finding. Warnings may accompany approved.",
  ].join("\n");

/** Binds the post-preview human decision to the exact local artifact. */
export const createPreviewAcceptanceBinding = (input: {
  actorID: string;
  actorRoles: string[];
  artifactHash: string;
  changeRequestID: string;
  commitSHA: string;
  decision: "approved" | "rejected";
  environment: "local-preview";
  evidenceHash: string;
  expiresAt: string;
  reviewerEvidenceHash: string;
  sourceDiffHash: string;
  version: number;
}): string =>
  sha256(
    JSON.stringify([
      input.changeRequestID,
      input.version,
      input.sourceDiffHash,
      input.commitSHA,
      input.artifactHash,
      input.evidenceHash,
      input.reviewerEvidenceHash,
      input.environment,
      input.decision,
      input.actorID,
      [...input.actorRoles].sort(),
      input.expiresAt,
    ]),
  );
