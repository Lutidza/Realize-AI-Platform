/**
 * @file packages/payload-ai-plugin/src/endpoints/changeProjection.ts
 * @version 2026-08-21
 * @description Builds the explicit Change Request DTO with execution and preview evidence.
 */

import type { ChangeRequestDTO } from "@realize/ai-contracts";
import { assessExecutionScope } from "@realize/change-engine";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { DeploymentRepository } from "./deploymentRepository";
import type { AIDocument } from "./repository";
import { ExecutionRepository } from "./executionRepository";
import { toChangeRequestDTO } from "./mappers";

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

/** Joins persistence records into the browser-safe aggregate projection. */
export const projectChangeRequest = async (input: {
  acceptance?: AIDocument;
  approval?: AIDocument;
  change: AIDocument;
  deploymentRepository: DeploymentRepository;
  executionRepository: ExecutionRepository;
  options: SanitizedRealizeAIPluginOptions;
  previewAcceptance?: AIDocument;
}): Promise<ChangeRequestDTO> => {
  const job = await input.executionRepository.getLatestJob(
    String(input.change.id),
  );
  const deployment = await input.deploymentRepository.getLatestDeployment(
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

  let previewReason: string | undefined;
  if (deployment) {
    previewReason = deploymentReason(deployment, input.previewAcceptance);
  } else if (!input.options.preview.enabled) {
    previewReason = "Local preview worker отключён конфигурацией.";
  } else if (input.acceptance?.decision !== "approved") {
    previewReason = "Сначала примите точный diff и его check evidence.";
  } else if (!job || job.status !== "completed") {
    previewReason = "Verified implementation artifact отсутствует.";
  } else if (job.diffTruncated === true || !job.diffHash || !job.evidenceHash) {
    previewReason = "Нельзя promoted сокращённый или неполный diff artifact.";
  } else if (input.change.state !== "changes_accepted") {
    previewReason = "Change Request не находится в состоянии changes_accepted.";
  } else if (Date.parse(String(job.artifactsExpireAt || "")) <= Date.now()) {
    previewReason =
      "Implementation artifact истёк; требуется новое выполнение.";
  }

  return toChangeRequestDTO(input.change, input.approval, {
    acceptance: input.acceptance,
    checkResults,
    deployment,
    deploymentChecks,
    executionEnabled: !job && !executionReason,
    executionJob: job,
    executionReason,
    previewAcceptance: input.previewAcceptance,
    previewEnabled: !deployment && !previewReason,
    previewReason,
  });
};
