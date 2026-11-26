/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/AuditRevision.types.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Описывает происхождение исправленного отчёта и ответы аудитора на возвращённые критерии.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import type { ReviewCriterionId } from "../conclusions/ReviewConclusion.types";

export type AuditRevisionResponse = {
  criterion: ReviewCriterionId;
  response: string;
  reportQuote: string;
};

export type AuditRevisionLink = {
  resultId: string;
  workId: string;
  decisionId: string;
  parentResultId: string;
  parentRevision: number;
  conclusionId: string;
  parentConclusionRevision: number;
  parentConclusionSha256: string;
  iteration: number;
  responses: AuditRevisionResponse[];
};
