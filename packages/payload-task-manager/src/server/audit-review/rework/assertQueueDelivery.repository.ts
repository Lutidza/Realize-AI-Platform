/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/assertQueueDelivery.repository.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Сверяет поступающую в runtime выдачу с владельцами плана, материалов и основания повторной итерации.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import type { PoolClient } from "pg";
import type { ReviewDelivery } from "../AuditPublication.types";
import { assertPublishedDelivery } from "../AuditDossier.repository";
import { assertReviewRoute } from "../auditReviewPlan.repository";
import { assertAcceptanceBasis } from "../conclusions/reviewAcceptanceBasis.repository";

/** Первичную работу можно получить до открытия приёмки. У повторной работы основание закреплено при её подготовке. */
export async function assertQueueDelivery(
  client: PoolClient,
  delivery: ReviewDelivery,
) {
  if (delivery.rework) {
    await assertAcceptanceBasis(client, delivery);
  } else {
    await assertReviewRoute(client, delivery);
    await assertPublishedDelivery(client, delivery);
  }
}
