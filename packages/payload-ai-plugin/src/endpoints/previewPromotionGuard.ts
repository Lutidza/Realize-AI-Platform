/**
 * @file packages/payload-ai-plugin/src/endpoints/previewPromotionGuard.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет исходный принятый diff и допустимость первой либо повторной попытки preview.
 */

import { createImplementationAcceptanceBinding } from "@realize/change-engine";

import { relationID } from "./mappers";
import type { AIDocument } from "./repository";

const futureDate = (value: unknown, now: number): boolean =>
  Date.parse(String(value || "")) > now;

/** Общая fail-closed проверка для API постановки preview и его доступности в DTO. */
export const previewPromotionReason = (input: {
  acceptance?: AIDocument;
  change: AIDocument;
  deployment?: AIDocument;
  job?: AIDocument;
  now?: number;
  previewAcceptance?: AIDocument;
}): string | undefined => {
  const { acceptance, change, deployment, job, previewAcceptance } = input;
  const now = input.now ?? Date.now();
  if (previewAcceptance)
    return "Решение по preview уже принято; повтор этой операции недоступен.";
  if (deployment) {
    if (
      change.state !== "preview_failed" ||
      deployment.status !== "failed" ||
      deployment.runtimeState !== "stopped"
    )
      return "Повтор доступен только после ошибки preview и завершения очистки окружения.";
  } else if (change.state !== "changes_accepted") {
    return "Сначала примите точный diff и его check evidence.";
  }
  if (
    !acceptance ||
    !job ||
    job.status !== "completed" ||
    job.diffTruncated === true ||
    !job.diff ||
    !job.diffHash ||
    !job.evidenceHash ||
    !job.baseCommit ||
    relationID(job.changeRequest) !== String(change.id)
  )
    return "Полный проверенный implementation artifact отсутствует.";
  if (
    !futureDate(job.artifactsExpireAt, now) ||
    !futureDate(acceptance.expiresAt, now)
  )
    return "Implementation artifact или его подтверждение истекли; требуется новое выполнение.";

  const decisionKey = String(acceptance.decisionKey || "");
  const acceptedVersion = Number(decisionKey.split(":")[1]);
  if (
    !Number.isSafeInteger(acceptedVersion) ||
    acceptedVersion < 1 ||
    acceptedVersion >= Number(change.version) ||
    decisionKey !== `${change.id}:${acceptedVersion}:IMPLEMENTATION_ACCEPTANCE`
  )
    return "Версия подтверждения implementation artifact недействительна.";
  const expectedBinding = createImplementationAcceptanceBinding({
    actorID: relationID(acceptance.actor),
    actorRoles: Array.isArray(acceptance.roleSnapshot)
      ? acceptance.roleSnapshot.filter(
          (role): role is string => typeof role === "string",
        )
      : [],
    changeRequestID: String(change.id),
    decision: "approved",
    diffHash: String(job.diffHash),
    evidenceHash: String(job.evidenceHash),
    expiresAt: String(acceptance.expiresAt),
    planHash: String(change.planHash || ""),
    scopeHash: String(change.scopeHash || ""),
    version: acceptedVersion,
  });
  if (
    relationID(acceptance.changeRequest) !== String(change.id) ||
    acceptance.decision !== "approved" ||
    acceptance.diffHash !== job.diffHash ||
    acceptance.boundHash !== expectedBinding
  )
    return "Подтверждение implementation не соответствует точному diff и evidence.";
  if (
    deployment &&
    (relationID(deployment.changeRequest) !== String(change.id) ||
      relationID(deployment.executionJob) !== String(job.id) ||
      deployment.baseCommit !== job.baseCommit ||
      deployment.sourceDiffHash !== job.diffHash ||
      deployment.sourceEvidenceHash !== job.evidenceHash ||
      deployment.boundImplementationHash !== acceptance.boundHash)
  )
    return "Исходный artifact изменился после предыдущей попытки preview.";
  return undefined;
};
