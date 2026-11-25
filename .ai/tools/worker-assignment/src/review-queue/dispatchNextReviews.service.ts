/**
 * @file .ai/tools/worker-assignment/src/review-queue/dispatchNextReviews.service.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Возобновляет повторные выдачи при остановке до подготовки работы и после commit очереди.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import type { ReviewIterationRepository } from "@realize/payload-task-manager/audit-review";
import type { ReviewQueueTransport } from "./ReviewDispatch.types";
import { reconcileReviewDelivery } from "./reconcileReviewDelivery.service";

/** Участника задаёт доверенный вызов или сохранённый claim. Досье заново проверяет его право на это поручение. */
export async function deliverNextReview(
  iterations: ReviewIterationRepository,
  transport: ReviewQueueTransport,
  actorId: string,
  workId: string,
) {
  const outcome = await reconcileReviewDelivery(
    async () => {
      const delivery = await iterations.prepareNextReview(actorId, workId);
      if (delivery.rework?.workId !== workId)
        throw new Error("review_delivery_conflict");
      return delivery;
    },
    (delivery, id) => iterations.acknowledge(delivery, id),
    transport,
  );
  return { workId, ...outcome };
}

/** Подбирает опубликованные доработки аудитора и полученные уточнения из их долговечных источников. */
export async function dispatchNextReviews(
  iterations: ReviewIterationRepository,
  transport: ReviewQueueTransport,
) {
  const outcomes = [];
  for (const { actorId, workId } of await iterations.pendingReviews())
    outcomes.push(
      await deliverNextReview(iterations, transport, actorId, workId),
    );
  return outcomes;
}
