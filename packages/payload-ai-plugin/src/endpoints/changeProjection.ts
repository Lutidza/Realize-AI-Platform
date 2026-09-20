/**
 * @file packages/payload-ai-plugin/src/endpoints/changeProjection.ts
 * @version 1.1.1
 * @date 2026-09-17
 * @description Собирает Change Request DTO с execution, preview, source и release evidence.
 */

import type { ChangeRequestDTO } from "@realize/ai-contracts";
import { assessExecutionScope } from "@realize/change-engine";

import { mapWorkerAvailability } from "../integrations/runtime/mapWorkerAvailability.mapper";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { DeploymentRepository } from "./deploymentRepository";
import type { AIDocument } from "./repository";
import { ExecutionRepository } from "./executionRepository";
import { toChangeRequestDTO } from "./mappers";
import { ReleaseRepository } from "./releaseRepository";
import { SourcePromotionRepository } from "./sourcePromotionRepository";
import { previewPromotionReason } from "./previewPromotionGuard";
import { releaseWorkerUnavailableReason } from "./releaseWorkerReadiness.validator";

const jobReason = (job: AIDocument, acceptance?: AIDocument): string => {
  if (acceptance?.decision === "approved") {
    return "Diff и evidence приняты; доступна отдельная promotion в local preview.";
  }
  if (acceptance?.decision === "rejected") {
    return "Результат отклонён и не может быть применён.";
  }
  switch (job.status) {
    case "queued":
      return "Задача ожидает отдельный execution worker.";
    case "preparing_workspace":
      return "Worker создаёт изолированный Git worktree.";
    case "running":
      return "Codex изменяет только утверждённый scope в worktree.";
    case "validating":
      return "Worker проверяет scope, diff и обязательные команды.";
    case "completed":
      return "Diff и проверки готовы для отдельного принятия человеком.";
    case "blocked":
      return "Execution заблокирован policy gate.";
    case "cancelled":
      return "Execution отменён.";
    default:
      return "Execution завершился ошибкой; основной checkout не изменён.";
  }
};

const deploymentReason = (
  deployment: AIDocument,
  previewAcceptance?: AIDocument,
): string => {
  if (previewAcceptance?.decision === "approved") {
    return "Preview принят. Production release требует отдельного approval и delivery workflow.";
  }
  if (previewAcceptance?.decision === "rejected") {
    return "Preview отклонён; promotion остановлена.";
  }
  switch (deployment.status) {
    case "queued":
      return "Promotion ожидает отдельный code-lane worker.";
    case "preparing_workspace":
      return "Worker применяет принятый diff в чистом worktree.";
    case "running_checks":
      return "Повторно проверяются hash, scope и server-owned checks.";
    case "reviewing":
      return "Отдельный read-only reviewer проверяет результат.";
    case "committing":
      return "Worker создаёт изолированный commit из проверенного diff.";
    case "starting_preview":
      return "Создаются sanitized DB clone и loopback preview runtime.";
    case "ready":
      return "Preview готов для отдельного принятия человеком.";
    case "accepted":
      return "Preview принят; production не изменён.";
    case "rejected":
      return "Preview отклонён; production не изменён.";
    case "expired":
      return "Срок local preview истёк, runtime очищен.";
    case "blocked":
      return "Promotion заблокирована policy gate.";
    case "cancelled":
      return "Promotion отменена.";
    default:
      return "Promotion завершилась ошибкой; production не изменён.";
  }
};

const releaseReason = (
  candidate: AIDocument,
  releaseApproval?: AIDocument,
): string => {
  if (releaseApproval?.decision === "approved") {
    return "Exact OCI digest утверждён; production deploy остаётся отдельной внешней операцией.";
  }
  if (releaseApproval?.decision === "rejected") {
    return "Release candidate отклонён; production не изменён.";
  }
  switch (candidate.status) {
    case "queued":
      return "OCI-кандидат ожидает server-owned release orchestrator.";
    case "preparing":
      return "Проверяются source preview, commit и approval binding.";
    case "building":
      return "Orchestrator собирает OCI image из exact commit.";
    case "scanning":
      return "Проверяются SBOM, scan, provenance и signature.";
    case "deploying_preview":
      return "OCI image разворачивается в отдельном preview environment.";
    case "verifying_preview":
      return "Проверяются health и evidence OCI preview.";
    case "ready":
      return "Подписанный OCI-кандидат готов для отдельного release approval.";
    case "approved":
      return "Release approval сохранён; production не изменён.";
    case "rejected":
      return "Release candidate отклонён; production не изменён.";
    case "expired":
      return "Срок OCI-кандидата истёк; требуется новая подготовка.";
    case "blocked":
      return "Release заблокирован policy gate.";
    default:
      return "Подготовка release завершилась ошибкой; production не изменён.";
  }
};

const sourcePromotionReason = (promotion: AIDocument): string => {
  switch (promotion.status) {
    case "queued":
      return "Публикация ожидает отдельный source-control worker.";
    case "validating":
      return "Worker повторно проверяет preview binding и GitHub destination.";
    case "publishing_ref":
      return "Exact service commit публикуется в изолированную GitHub-ветку.";
    case "creating_pull_request":
      return "Worker создаёт или находит идемпотентный draft Pull Request.";
    case "ready":
      return "Draft Pull Request создан; main и текущий checkout не изменены.";
    case "blocked":
      return "Source promotion заблокирована policy или integration gate.";
    default:
      return "Публикация Pull Request завершилась ошибкой; Git history main не изменена.";
  }
};

/** Объединяет persistence records в browser-safe aggregate projection. */
export const projectChangeRequest = async (input: {
  acceptance?: AIDocument;
  approval?: AIDocument;
  change: AIDocument;
  deploymentRepository: DeploymentRepository;
  executionRepository: ExecutionRepository;
  options: SanitizedRealizeAIPluginOptions;
  previewAcceptance?: AIDocument;
  releaseApproval?: AIDocument;
  releaseRepository: ReleaseRepository;
  sourcePromotionRepository: SourcePromotionRepository;
}): Promise<ChangeRequestDTO> => {
  const job = await input.executionRepository.getLatestJob(
    String(input.change.id),
  );
  const assignedInstanceKey =
    job &&
    ["preparing_workspace", "running", "validating"].includes(
      String(job.status),
    )
      ? String(job.workerID || "unreported")
      : undefined;
  const presenceRead =
    input.executionRepository.readWorkerPresence(assignedInstanceKey);
  const deployment = await input.deploymentRepository.getLatestDeployment(
    String(input.change.id),
  );
  const releaseCandidate = await input.releaseRepository.getLatestCandidate(
    String(input.change.id),
  );
  const sourcePromotion =
    await input.sourcePromotionRepository.getLatestPromotion(
      String(input.change.id),
    );
  const checkResults = job
    ? await input.executionRepository.listCheckResults(String(job.id))
    : [];
  const deploymentChecks = deployment
    ? await input.deploymentRepository.listCheckResults(String(deployment.id))
    : [];

  let executionReason: string | undefined;
  if (job) {
    executionReason = jobReason(job, input.acceptance);
  } else if (!input.options.execution.enabled) {
    executionReason = "Изолированный execution worker отключён конфигурацией.";
  } else if (input.approval?.decision !== "approved") {
    executionReason = "Сначала утвердите точную версию плана.";
  } else if (input.change.state !== "plan_approved") {
    executionReason = "Change Request не находится в состоянии plan_approved.";
  } else if (Date.parse(String(input.approval.expiresAt || "")) <= Date.now()) {
    executionReason = "Срок действия plan approval истёк.";
  } else {
    const assessment = assessExecutionScope({
      affectedPaths: Array.isArray(input.change.affectedPaths)
        ? input.change.affectedPaths.filter(
            (path): path is string => typeof path === "string",
          )
        : [],
      checks: Array.isArray(input.change.checks)
        ? input.change.checks.filter(
            (check): check is string => typeof check === "string",
          )
        : [],
      type: String(input.change.type || ""),
    });
    if (!assessment.allowed) executionReason = assessment.reason;
    const secret = process.env[input.options.execution.signingSecretEnv];
    if (
      !executionReason &&
      (!secret || Buffer.byteLength(secret, "utf8") < 32)
    ) {
      executionReason =
        "Execution signing secret отсутствует или слишком короткий.";
    }
  }

  const previewEligibilityReason = previewPromotionReason({
    acceptance: input.acceptance,
    change: input.change,
    deployment,
    job,
    previewAcceptance: input.previewAcceptance,
  });
  const previewEnabled =
    input.options.execution.enabled &&
    input.options.preview.enabled &&
    !previewEligibilityReason;
  let previewReason: string | undefined =
    !input.options.preview.enabled || !input.options.execution.enabled
      ? "Local preview worker отключён конфигурацией."
      : previewEnabled
        ? undefined
        : deployment && deployment.status !== "failed"
          ? deploymentReason(deployment, input.previewAcceptance)
          : previewEligibilityReason;

  let candidateReason: string | undefined;
  if (releaseCandidate) {
    candidateReason = releaseReason(releaseCandidate, input.releaseApproval);
  } else if (!input.options.release.enabled) {
    candidateReason = "OCI release worker отключён конфигурацией.";
  } else if (input.previewAcceptance?.decision !== "approved") {
    candidateReason = "Сначала примите exact local preview artifact.";
  } else if (
    !deployment ||
    deployment.status !== "accepted" ||
    !deployment.artifactHash ||
    !deployment.commitSHA ||
    !deployment.evidenceHash
  ) {
    candidateReason = "Принятое preview evidence неполно или изменилось.";
  } else if (input.change.state !== "preview_accepted") {
    candidateReason =
      "Change Request не находится в состоянии preview_accepted.";
  } else if (Date.parse(String(deployment.expiresAt || "")) <= Date.now()) {
    candidateReason = "Срок исходного preview artifact истёк.";
  }

  let promotionReason: string | undefined;
  if (sourcePromotion) {
    promotionReason = sourcePromotionReason(sourcePromotion);
  } else if (!input.options.sourcePromotion.enabled) {
    promotionReason =
      "GitHub Pull Request publication отключена конфигурацией.";
  } else if (input.previewAcceptance?.decision !== "approved") {
    promotionReason = "Сначала примите exact local preview artifact.";
  } else if (
    !deployment ||
    deployment.status !== "accepted" ||
    !deployment.artifactHash ||
    !deployment.commitSHA ||
    !deployment.evidenceHash ||
    !deployment.reviewEvidenceHash
  ) {
    promotionReason = "Принятое preview evidence неполно или изменилось.";
  } else if (Date.parse(String(deployment.expiresAt || "")) <= Date.now()) {
    promotionReason = "Срок исходного preview artifact истёк.";
  }

  const presence = await presenceRead;
  if (!releaseCandidate && !candidateReason)
    candidateReason = releaseWorkerUnavailableReason(
      presence,
      String(input.change.id),
    );
  const worker = mapWorkerAvailability(presence, {
    operation: "execution",
    assignedInstanceKey,
    allowedChangeRequestID: String(input.change.id),
    disabledReason:
      !assignedInstanceKey && !input.options.enabled
        ? "Агент выключен в админке. Задание останется в очереди до включения."
        : !assignedInstanceKey && !input.options.execution.enabled
          ? "Выполнение кода выключено в настройках агента. Задание остаётся в очереди."
          : undefined,
  });
  if (job?.status === "queued") executionReason = worker.reason;
  if (deployment?.status === "queued")
    previewReason = mapWorkerAvailability(presence, {
      operation: "preview",
      allowedChangeRequestID: String(input.change.id),
      disabledReason: !input.options.preview.enabled
        ? "Предпросмотр выключен в настройках агента. Задание остаётся в очереди."
        : undefined,
    }).reason;
  if (sourcePromotion?.status === "queued")
    promotionReason = mapWorkerAvailability(presence, {
      operation: "sourcePromotion",
      allowedChangeRequestID: String(input.change.id),
      disabledReason: !input.options.sourcePromotion.enabled
        ? "Публикация изменений выключена в настройках агента. Задание остаётся в очереди."
        : undefined,
    }).reason;
  if (releaseCandidate?.status === "queued")
    candidateReason = mapWorkerAvailability(presence, {
      operation: "release",
      allowedChangeRequestID: String(input.change.id),
      disabledReason: !input.options.release.enabled
        ? "Подготовка выпуска выключена в настройках агента. Задание остаётся в очереди."
        : undefined,
    }).reason;

  return toChangeRequestDTO(input.change, input.approval, {
    executionWorker: worker,
    acceptance: input.acceptance,
    checkResults,
    deployment,
    deploymentChecks,
    executionEnabled: !job && !executionReason,
    executionJob: job,
    executionReason,
    previewAcceptance: input.previewAcceptance,
    previewEnabled,
    previewReason,
    releaseApproval: input.releaseApproval,
    releaseCandidate,
    releaseEnabled: !releaseCandidate && !candidateReason,
    releaseReason: candidateReason,
    sourcePromotion,
    sourcePromotionEnabled:
      (!sourcePromotion && !promotionReason) ||
      Boolean(
        sourcePromotion &&
        (sourcePromotion.status === "failed" ||
          sourcePromotion.status === "blocked") &&
        input.options.sourcePromotion.enabled &&
        input.previewAcceptance?.decision === "approved" &&
        deployment?.status === "accepted" &&
        deployment.artifactHash &&
        deployment.commitSHA &&
        deployment.evidenceHash &&
        deployment.reviewEvidenceHash &&
        Date.parse(String(deployment.expiresAt || "")) > Date.now(),
      ),
    sourcePromotionReason: promotionReason,
  });
};
