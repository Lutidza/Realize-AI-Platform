/**
 * @file packages/payload-task-manager/src/server/audit-review/AuditReviewPlan.types.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Описывает назначения и закреплённые источники одной ревизии плана аудита.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import type { AuditTaskBinding, ReviewTarget } from "./AuditPublication.types";

/** Участников указывает доверенный планировщик до выдачи работы. */
export type AuditPlanInput = {
  task: AuditTaskBinding;
  auditAttemptId: string;
  auditorId: string;
  implementationAuthorId: string;
  reviewerId: string;
  review: ReviewTarget;
  sourcePins: Record<string, string>;
  scopePins: Record<string, string>;
};
