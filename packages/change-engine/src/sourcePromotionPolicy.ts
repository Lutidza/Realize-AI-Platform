/**
 * @file packages/change-engine/src/sourcePromotionPolicy.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Связывает source promotion с exact preview evidence и проверяет GitHub PR result.
 */

import { createHash } from "node:crypto";

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const branchPattern = /^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._/-]{1,200}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const repositoryPattern = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

/** Выводит идемпотентный key из accepted preview и GitHub destination. */
export const createSourcePromotionKey = (input: {
  baseBranch: string;
  changeRequestID: string;
  gitCommit: string;
  repositorySlug: string;
  sourceAcceptanceHash: string;
  sourcePreviewArtifactHash: string;
  sourcePreviewEvidenceHash: string;
}): string =>
  sha256(
    JSON.stringify([
      input.changeRequestID,
      input.repositorySlug.toLowerCase(),
      input.baseBranch,
      input.gitCommit,
      input.sourceAcceptanceHash,
      input.sourcePreviewArtifactHash,
      input.sourcePreviewEvidenceHash,
    ]),
  );

/** Создаёт единственное server-owned имя ветки для одного promotion key. */
export const createSourcePromotionHeadBranch = (input: {
  changeRequestID: string;
  promotionKey: string;
}): string => {
  const changeID = input.changeRequestID.replace(/[^A-Za-z0-9_-]/g, "-");
  return `ai/changes/${changeID}-${input.promotionKey.slice(0, 12)}`;
};

/** Хеширует подтверждённый GitHub result вместе с exact source binding. */
export const createSourcePromotionEvidenceHash = (input: {
  baseBranch: string;
  draft: boolean;
  gitCommit: string;
  headBranch: string;
  promotionKey: string;
  pullRequestNumber: number;
  pullRequestState: "closed" | "open";
  pullRequestURL: string;
  repositorySlug: string;
  sourceAcceptanceHash: string;
  sourcePreviewArtifactHash: string;
  sourcePreviewEvidenceHash: string;
}): string =>
  sha256(
    JSON.stringify([
      input.promotionKey,
      input.repositorySlug.toLowerCase(),
      input.baseBranch,
      input.headBranch,
      input.gitCommit,
      input.pullRequestNumber,
      input.pullRequestURL,
      input.pullRequestState,
      input.draft,
      input.sourceAcceptanceHash,
      input.sourcePreviewArtifactHash,
      input.sourcePreviewEvidenceHash,
    ]),
  );

/** Fail-closed проверяет exact source и разрешённый namespace ветки. */
export const assessSourcePromotionDestination = (input: {
  baseBranch: string;
  gitCommit: string;
  headBranch: string;
  repositorySlug: string;
}): { allowed: true } | { allowed: false; reason: string } => {
  if (!repositoryPattern.test(input.repositorySlug)) {
    return { allowed: false, reason: "GitHub repository identity is invalid." };
  }
  if (
    !branchPattern.test(input.baseBranch) ||
    !branchPattern.test(input.headBranch) ||
    !input.headBranch.startsWith("ai/changes/")
  ) {
    return { allowed: false, reason: "Source promotion branch is invalid." };
  }
  if (!commitPattern.test(input.gitCommit)) {
    return { allowed: false, reason: "Source promotion commit is invalid." };
  }
  return { allowed: true };
};

/** Fail-closed проверка нормализованного GitHub Pull Request evidence. */
export const assessSourcePromotionEvidence = (input: {
  baseBranch: string;
  draft: boolean;
  evidenceHash: string;
  gitCommit: string;
  headBranch: string;
  promotionKey: string;
  pullRequestNumber: number;
  pullRequestState: "closed" | "open";
  pullRequestURL: string;
  repositorySlug: string;
  sourceAcceptanceHash: string;
  sourcePreviewArtifactHash: string;
  sourcePreviewEvidenceHash: string;
}): { allowed: true } | { allowed: false; reason: string } => {
  const destination = assessSourcePromotionDestination(input);
  if (!destination.allowed) return destination;
  if (!hashPattern.test(input.evidenceHash)) {
    return {
      allowed: false,
      reason: "Source promotion evidence hash is invalid.",
    };
  }
  if (
    !Number.isInteger(input.pullRequestNumber) ||
    input.pullRequestNumber < 1
  ) {
    return { allowed: false, reason: "Pull Request number is invalid." };
  }
  if (!input.draft || input.pullRequestState !== "open") {
    return {
      allowed: false,
      reason: "Source promotion requires an open draft Pull Request.",
    };
  }
  const expectedURL = `https://github.com/${input.repositorySlug}/pull/${input.pullRequestNumber}`;
  if (input.pullRequestURL.toLowerCase() !== expectedURL.toLowerCase()) {
    return {
      allowed: false,
      reason: "Pull Request URL does not match its repository.",
    };
  }
  if (createSourcePromotionEvidenceHash(input) !== input.evidenceHash) {
    return {
      allowed: false,
      reason: "Source promotion evidence hash does not match its result.",
    };
  }
  return { allowed: true };
};
