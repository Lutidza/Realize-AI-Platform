/**
 * @file .ai/tools/task-workspace/src/artifacts/WorkspaceArtifacts.types.ts
 * @version 1.0.1
 * @date 2026-10-15
 * @description Описывает вход регистрации артефактов и режим общей подготовки записей манифеста.
 * @see documentation/specifications/task-management-execution.md
 */
import type { WorkspaceArtifact } from "@realize/payload-task-manager/workspace-contracts";

/** Identity процесса и снимок дерева назначает регистрация, а не вызывающий код. */
export type WorkspaceArtifactRegistration = Pick<
  WorkspaceArtifact,
  "path" | "category" | "retention"
> &
  Partial<Pick<WorkspaceArtifact, "stageId" | "attemptId">> & {
    producer: Pick<WorkspaceArtifact["producer"], "id" | "pid" | "settled">;
  };

export type WorkspaceArtifactRegistrationInput = {
  artifacts: WorkspaceArtifactRegistration[];
};

/** Проверка до создания producer-каталогов использует пустой снимок только в памяти. */
export type WorkspaceArtifactPreparationOptions = {
  captureSnapshot?: boolean;
  now?: string;
  emptyDirectorySnapshot?: { hash: string; bytes: number };
};

export type WorkspaceArtifactSettlementInput = {
  artifactIds: readonly string[];
};
