/**
 * @file .ai/tools/worker-assignment/src/review-queue/dispatchPendingReviews.service.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Сверяет доставку опубликованных результатов с очередью и подтверждает обработку событий досье.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import type {
  ReviewDispatchOutcome,
  ReviewDispatchSource,
  ReviewQueueTransport,
} from "./ReviewDispatch.types";
import { reconcileReviewDelivery } from "./reconcileReviewDelivery.service";

/** Отказ одного назначения сохраняет возможность обработать события остальных задач. */
export async function dispatchPendingReviews(
  dossier: ReviewDispatchSource,
  transport: ReviewQueueTransport,
) {
  const outcomes: ReviewDispatchOutcome[] = [];
  for (const resultId of await dossier.pendingEvents()) {
    const outcome = await reconcileReviewDelivery(
      async () => {
        const delivery = await dossier.prepareDelivery(resultId);
        if (delivery.resultId !== resultId || delivery.rework)
          throw new Error("audit_delivery_conflict");
        return delivery;
      },
      (d, id) => dossier.acknowledge(d, id),
      transport,
    );
    outcomes.push({ resultId, ...outcome });
  }
  return outcomes;
}
