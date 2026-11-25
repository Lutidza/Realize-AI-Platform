/**
 * @file .ai/tools/worker-assignment/src/assessAssignmentReadiness.validator.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Сверяет полноту пакета, доставку источников и фактическую область доступа.
 */
import type {
  AssignmentContextEvidence,
  AssignmentContextIdentity,
  AssignmentMaterial,
  PreparationIssue,
} from "./WorkerAssignment.types";

/** Evidence выдаёт доверенный адаптер для одного контекста. CLI не принимает его из манифеста или флага. */
export function assessAssignmentReadiness(
  expected: AssignmentContextIdentity | undefined,
  sources: AssignmentMaterial[],
  readPaths: string[],
  preparationIssues: PreparationIssue[],
  evidence?: AssignmentContextEvidence,
) {
  const issues = [...preparationIssues];
  if (
    evidence &&
    (!expected ||
      evidence.contextId !== expected.contextId ||
      evidence.lockSha256 !== expected.lockSha256 ||
      evidence.assignmentId !== expected.assignmentId ||
      evidence.revision !== expected.revision)
  ) {
    issues.push({
      code: "context_mismatch",
      reason:
        "Подтверждение относится к другому контексту, назначению или ревизии.",
    });
  } else {
    const delivered = evidence?.delivered;
    const mismatch = sources.find(
      (source, i) =>
        delivered?.[i]?.path !== source.path ||
        delivered[i].sha256 !== source.sha256 ||
        delivered[i].bytes !== source.bytes,
    );
    if (!delivered || delivered.length !== sources.length || mismatch) {
      issues.push({
        code: "context_not_delivered",
        path: mismatch?.path ?? delivered?.[sources.length]?.path,
        reason:
          "Передача полного текста обязательных источников в контекст исполнителя не подтверждена.",
      });
    }
    const access = evidence?.effectiveAccess;
    if (!access) {
      issues.push({
        code: "adapter_unbound",
        reason:
          "Адаптер запуска с подтверждёнными ограничениями путей и инструментов не привязан.",
      });
    } else if (
      !access.enforced ||
      access.writePaths.length ||
      access.tools.length !== 1 ||
      access.tools[0] !== "repo_read_file" ||
      access.readPaths.length !== readPaths.length ||
      !readPaths.every((path) => access.readPaths.includes(path))
    ) {
      issues.push({
        code: "access_mismatch",
        reason:
          "Эффективные права адаптера расходятся с областью чтения назначения.",
      });
    }
  }
  return {
    status: issues.length ? ("blocked" as const) : ("ready" as const),
    issues,
  };
}
