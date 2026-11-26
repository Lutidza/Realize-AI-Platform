/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/reviewIterationDelivery.repository.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Сверяет канонический конверт повторной выдачи и закреплённое основание с действующим источником.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import { isDeepStrictEqual as equal } from "node:util";
import type { PoolClient } from "pg";
import type { ReviewDelivery } from "../AuditPublication.types";
import type { ReviewBasis } from "../conclusions/ReviewConclusion.types";

export async function readIterationRoute(client: PoolClient, workId: string) {
  const row = await client.query<{
    envelope: ReviewDelivery;
    basis: ReviewBasis;
  }>("SELECT envelope,basis FROM audit_rework.review_routes WHERE work_id=$1", [
    workId,
  ]);
  return row.rows[0] ?? null;
}

/** Неизменяемый конверт включает хеш родителя и точные версии обоих артефактов. */
export async function assertIterationDelivery(
  client: PoolClient,
  delivery: ReviewDelivery,
) {
  const workId = delivery.rework?.workId;
  if (!workId || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(workId))
    throw new Error("audit_delivery_conflict");
  const route = await readIterationRoute(client, workId);
  if (!route || !equal(route.envelope, delivery))
    throw new Error("audit_delivery_conflict");
  return route.basis;
}
