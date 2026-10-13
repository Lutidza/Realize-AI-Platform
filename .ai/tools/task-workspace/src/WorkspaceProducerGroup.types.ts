/**
 * @file .ai/tools/task-workspace/src/WorkspaceProducerGroup.types.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Описывает caller-controlled producer group и проверяемый итог её точечной финализации.
 * @see documentation/specifications/task-management-execution.md
 */
import type { WorkspaceArtifact } from "@realize/payload-task-manager/workspace-contracts";
import type { applyWorkspaceCleanup } from "./applyWorkspaceCleanup.service.mjs";

/** Директории создаются только для существующего managed-досье; retention берётся из workspace contract. */
export type WorkspaceProducerGroupInput = {
  stageId?: WorkspaceArtifact["stageId"];
  attemptId?: WorkspaceArtifact["attemptId"];
  artifacts: Array<
    Pick<WorkspaceArtifact, "path" | "category"> &
      Partial<Pick<WorkspaceArtifact, "retention">>
  >;
};

/** Process-local handle принадлежит begin; сериализация не переносит приватную привязку metadata. */
export type WorkspaceProducerGroup = Readonly<{
  localKey: string;
  localDossierId: string;
  stageId: WorkspaceArtifact["stageId"];
  attemptId: WorkspaceArtifact["attemptId"];
  artifactIds: readonly string[];
  paths: readonly string[];
}>;

/** Quiescence подтверждает caller после child exit, flush streams и восстановления своих inputs. */
export type WorkspaceProducerGroupFinalizationInput = {
  quiescent: boolean;
  cleanupTemporary: boolean;
};

/** Blocked не объявляет cleanup успешным; receipt существует только после штатного completed apply. */
export type WorkspaceProducerGroupFinalization = {
  status: "completed" | "blocked";
  artifactIds: readonly string[];
  reason?: string;
  cleanup: {
    status: "completed" | "blocked" | "not_requested" | "not_needed";
    paths: readonly string[];
    reason?: string;
    receipt?: ReturnType<typeof applyWorkspaceCleanup>;
  };
};
