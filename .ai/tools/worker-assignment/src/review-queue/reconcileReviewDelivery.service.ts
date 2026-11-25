/**
 * @file .ai/tools/worker-assignment/src/review-queue/reconcileReviewDelivery.service.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Восстанавливает приём первичной или повторной выдачи через канонический ключ runtime.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import { isDeepStrictEqual } from "node:util";
import type { ReviewDelivery } from "@realize/payload-task-manager/audit-review";
import type {
  QueueDeliveryOutcome,
  ReviewQueueTransport,
} from "./ReviewDispatch.types";
import { reviewDispatchKey } from "./reviewDispatchKey.util";

const BLOCKED_REASONS = new Set([
  "review_assignment_unavailable",
  "review_access_denied",
  "review_independence_required",
  "review_delivery_conflict",
  "audit_result_unavailable",
  "audit_delivery_conflict",
  "review_basis_stale",
  "review_basis_unavailable",
  "rework_access_denied",
  "rework_attempt_unbound",
  "review_rework_mismatch",
  "audit_revision_unavailable",
  "orchestrator_access_denied",
  "orchestrator_independence_required",
  "review_iteration_required",
]);

/** Восстанавливает квитанцию при неизвестном исходе до любой новой отправки. */
export async function reconcileReviewDelivery(
  prepare: () => Promise<ReviewDelivery>,
  acknowledge: (delivery: ReviewDelivery, jobId: string) => Promise<unknown>,
  transport: ReviewQueueTransport,
): Promise<QueueDeliveryOutcome> {
  let phase: "prepare" | "lookup" | "submit" | "acknowledge" = "prepare";
  try {
    const delivery = await prepare();
    phase = "lookup";
    let receipt = await transport.lookup(reviewDispatchKey(delivery));
    if (receipt === undefined)
      return {
        status: "retry_pending",
        reason: "lookup_unconfirmed",
      };
    if (receipt === null) {
      phase = "submit";
      receipt = await transport.submit(structuredClone(delivery));
    }
    if (!receipt?.jobId || !isDeepStrictEqual(delivery, receipt.delivery))
      throw new Error("review_delivery_conflict");
    phase = "acknowledge";
    await acknowledge(delivery, receipt.jobId);
    return { status: "queued", jobId: receipt.jobId };
  } catch (error) {
    if (error instanceof Error && BLOCKED_REASONS.has(error.message))
      return { status: "blocked", reason: error.message };
    // Событие остаётся в досье до подтверждения. Следующий проход начинает с lookup.
    if (phase === "submit")
      return {
        status: "delivery_unknown",
        reason: "submit_unconfirmed",
      };
    return {
      status: "retry_pending",
      reason: phase + "_unconfirmed",
    };
  }
}
