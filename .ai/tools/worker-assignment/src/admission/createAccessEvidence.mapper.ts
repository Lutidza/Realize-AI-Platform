/**
 * @file .ai/tools/worker-assignment/src/admission/createAccessEvidence.mapper.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Копирует метаданные проверенного пакета и открывает подтверждение с неизвестными правами.
 * @see documentation/architecture/assignment-adapter/adapter-access-evidence-v1.md
 */
import type { AdapterAccessEvidenceV1 } from "@realize/ai-contracts";
import type { BoundAssignment } from "./AssignmentAdmission.types";

/** Значения доступа заполняет адаптер по мере появления наблюдений этой попытки. */
export function createAccessEvidence(
  report: BoundAssignment["report"],
  attemptId: string,
  executor: AdapterAccessEvidenceV1["executor"],
): AdapterAccessEvidenceV1 {
  const { assignmentId, revision, contextId, lockSha256, delivered } = report;
  return {
    schemaVersion: 1,
    assignmentId,
    revision,
    contextId,
    lockSha256,
    attemptId,
    executor: structuredClone(executor),
    preparedSources: structuredClone(delivered),
    access: {
      coverage: "unknown",
      routes: null,
      readPaths: null,
      writePaths: null,
      readsPinned: null,
      outsideReadDenied: null,
      writeDenied: null,
    },
    observations: [],
    binding: null,
    issues: [],
  };
}
