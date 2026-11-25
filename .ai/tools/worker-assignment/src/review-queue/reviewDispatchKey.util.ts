/**
 * @file .ai/tools/worker-assignment/src/review-queue/reviewDispatchKey.util.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Получает ключ единственной работы по назначению и итерации этапа ревью.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import type { ReviewDelivery } from "@realize/payload-task-manager/audit-review";
import { createHash } from "node:crypto";

/** Разные материалы для той же работы должны встретиться на одном ключе и дать конфликт. */
export function reviewDispatchKey({ task, target }: ReviewDelivery) {
  const identity = [
    task.projectId,
    target.executionId,
    target.stageId,
    target.assignmentId,
    target.assignmentRevision,
    target.iteration,
  ];
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}
