/**
 * @file .ai/tools/worker-assignment/src/review-queue/receiveReviewMaterials.service.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Выдаёт получившему работу ревьюеру точные версии отчёта и карты из закрытого досье.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import { createHash } from "node:crypto";
import type { AuditDossierRepository } from "@realize/payload-task-manager/audit-review";
import type { PostgresReviewQueue } from "./PostgresReview.repository";

/** При обрыве чтения тот же участник и consumer продолжают по сохранённой квитанции claim. */
export async function receiveReviewMaterials(
  queue: Pick<PostgresReviewQueue, "claim">,
  dossier: Pick<AuditDossierRepository, "readArtifact">,
  key: string,
  trustedActorId: string,
  consumerId: string,
) {
  const job = await queue.claim(key, trustedActorId, consumerId);
  const { delivery } = job;
  async function readPinned(kind: "report" | "coverage") {
    const bytes = await dossier.readArtifact(
      delivery.resultId,
      kind,
      trustedActorId,
    );
    if (
      createHash("sha256").update(bytes).digest("hex") !== delivery[kind].sha256
    )
      throw new Error("review_material_mismatch");
    return bytes;
  }
  const report = await readPinned("report");
  const coverage = await readPinned("coverage");
  return { job, report, coverage };
}
