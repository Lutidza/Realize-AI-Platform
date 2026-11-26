/**
 * @file .ai/tools/worker-assignment/src/review-queue/ReviewDispatch.types.ts
 * @version 1.1.1
 * @date 2026-11-26
 * @description Определяет квитанцию приёма работы очередью и результат доставки события досье.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import type { ReviewDelivery } from "@realize/payload-task-manager/audit-review";

export type ReviewJobReceipt = { jobId: string; delivery: ReviewDelivery };

/** lookup использует тот же ключ работы, которым runtime защищает submit от повторов. */
export interface ReviewQueueTransport {
  lookup(key: string): Promise<ReviewJobReceipt | null>;
  submit(delivery: ReviewDelivery): Promise<ReviewJobReceipt>;
}

export interface ReviewDispatchSource {
  pendingEvents(): Promise<string[]>;
  prepareDelivery(resultId: string): Promise<ReviewDelivery>;
  acknowledge(delivery: ReviewDelivery, jobId: string): Promise<unknown>;
}

export type QueueDeliveryOutcome =
  | { status: "queued"; jobId: string }
  | {
      status: "blocked" | "retry_pending" | "delivery_unknown";
      reason: string;
    };
export type ReviewDispatchOutcome = QueueDeliveryOutcome & { resultId: string };
