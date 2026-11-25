/**
 * @file .ai/tools/worker-assignment/src/admission/assessAdapterAdmission.validator.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Решает допуск к статическому аудиту по пакету, фактам адаптера и живой привязке.
 * @see documentation/architecture/assignment-adapter/article-audit-evidence.md
 */
import { adapterAccessEvidenceV1Schema } from "@realize/ai-contracts";
import { isDeepStrictEqual as equal } from "node:util";
import type {
  AdmissionAttempt,
  AdmissionAuthority,
  BoundAssignment,
  ObservationFacts,
} from "./AssignmentAdmission.types";

const blocked = (code: string, reason: string) => ({
  status: "blocked" as const,
  issues: [{ code, reason }],
});

/** Порядок путей не влияет на полномочия. Повторы сохраняются и выявляются при сравнении. */
function orderedPaths(
  facts: ObservationFacts[keyof ObservationFacts] | undefined,
) {
  return facts && "readPaths" in facts && facts.readPaths
    ? { ...facts, readPaths: facts.readPaths.toSorted() }
    : facts;
}

/** Эталон пакета берётся из повторного bind, выбор исполнителя — из решения оркестратора. */
export function assessAdapterAdmission(
  report: BoundAssignment["report"],
  attempt: AdmissionAttempt,
  message: unknown,
  authority: AdmissionAuthority,
) {
  const parsed = adapterAccessEvidenceV1Schema.safeParse(message);
  if (!parsed.success)
    return blocked("evidence_invalid", "Неверный формат подтверждения V1.");
  if (
    report.status !== "ready" ||
    !report.effectiveAccess.enforced ||
    !equal(report.effectiveAccess.tools, ["repo_read_file"]) ||
    report.effectiveAccess.writePaths.length
  )
    return blocked(
      "access_mismatch",
      "Локальная привязка не подтверждает права статического аудита.",
    );
  const e = parsed.data;
  if (
    e.contextId !== report.contextId ||
    e.assignmentId !== report.assignmentId ||
    e.revision !== report.revision ||
    e.lockSha256 !== report.lockSha256 ||
    e.attemptId !== attempt.attemptId
  )
    return blocked(
      "context_mismatch",
      "Назначение, ревизия, привязка или попытка изменились.",
    );
  if (
    e.executor.adapterId !== attempt.target.adapterId ||
    e.executor.providerId !== attempt.target.providerId ||
    !equal(e.executor.selection, attempt.target.selection)
  )
    return blocked(
      "executor_mismatch",
      "Исполнитель расходится с выбором оркестратора.",
    );
  if (!equal(e.preparedSources, report.delivered))
    return blocked(
      "context_not_delivered",
      "Состав, хеши или размеры подготовленных источников изменились.",
    );
  if (e.issues.length) return { status: "blocked" as const, issues: e.issues };
  const a = e.access;
  if (a.coverage !== "complete")
    return blocked(
      "access_unverified",
      "Полная область доступа не подтверждена.",
    );
  if (
    !equal(a.routes, [{ tool: "repo_read_file", via: "direct" }]) ||
    !equal(
      a.readPaths?.toSorted(),
      report.effectiveAccess.readPaths.toSorted(),
    ) ||
    !equal(a.writePaths, []) ||
    a.readsPinned !== true ||
    a.outsideReadDenied !== true ||
    a.writeDenied !== true
  )
    return blocked(
      "transport_access_mismatch",
      "Маршруты, пути, проверка версий или запреты расходятся с назначением.",
    );

  const facts: ObservationFacts = {
    "tool-catalog": {
      coverage: a.coverage,
      routes: a.routes,
      readPaths: a.readPaths,
    },
    "dispatch-policy": {
      routes: a.routes,
      readPaths: a.readPaths,
      writePaths: a.writePaths,
      readsPinned: a.readsPinned,
    },
    "read-probe": { readPaths: a.readPaths, readsPinned: a.readsPinned },
    "denial-probe": {
      outsideReadDenied: a.outsideReadDenied,
      writeDenied: a.writeDenied,
    },
  };
  const confirmed = new Set<string>();
  const ids = new Set<string>();
  try {
    for (const ref of e.observations) {
      if (
        ids.has(ref.evidenceId) ||
        !equal(
          orderedPaths(authority.resolve(attempt.attemptId, ref)),
          orderedPaths(facts[ref.kind]),
        )
      )
        return blocked(
          "observation_unverified",
          "Ссылка на наблюдение не подтверждает факты этой попытки.",
        );
      confirmed.add(ref.kind);
      ids.add(ref.evidenceId);
    }
    if (confirmed.size !== Object.keys(facts).length)
      return blocked(
        "observation_unverified",
        "Отсутствуют обязательные наблюдения каталога, диспетчера или проб.",
      );
    if (
      !e.binding ||
      e.binding.kind !== attempt.bindingKind ||
      !authority.isCurrent(attempt.attemptId, e.binding)
    )
      return blocked(
        "binding_unavailable",
        "Проверенный получатель недоступен для передачи.",
      );
  } catch {
    return blocked(
      "evidence_unavailable",
      "Доверенный адаптер не подтвердил наблюдения или привязку.",
    );
  }
  return { status: "ready" as const, issues: [], binding: e.binding };
}
