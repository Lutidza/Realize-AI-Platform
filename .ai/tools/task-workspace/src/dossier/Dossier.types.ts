/**
 * @file .ai/tools/task-workspace/src/dossier/Dossier.types.ts
 * @version 1.0.0
 * @date 2026-10-15
 * @description Описывает прочитанное локальное досье и вход создания поверх публичных контрактов задачи.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  WorkspaceTask,
  WorkspaceArtifactManifest,
} from "@realize/payload-task-manager/workspace-contracts";

export type { WorkspaceTask, WorkspaceArtifactManifest };

/** Legacy-досье не имеет machine metadata до явного adopt. */
export type WorkspaceDossier = {
  base: string;
  body: string;
  documentHash: string;
  bodyHash: string;
  meta: WorkspaceTask | null;
};

/** Результат проверки managed metadata; не применяется к произвольному TASK. */
export type ManagedWorkspaceDossier = WorkspaceDossier & {
  meta: WorkspaceTask;
};

export type CreateWorkspaceDossierInput = {
  key: string;
  title: string;
  body?: string;
  category?: "open" | "active";
  acceptanceRequired?: boolean;
  deliveryRequired?: boolean;
  requiredChecks?: WorkspaceTask["requiredChecks"];
};
