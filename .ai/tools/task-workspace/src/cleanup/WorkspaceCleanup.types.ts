/**
 * @file .ai/tools/task-workspace/src/cleanup/WorkspaceCleanup.types.ts
 * @version 1.0.1
 * @date 2026-10-15
 * @description Описывает план, фазы восстановления очистки и завершённую квитанцию.
 * @see documentation/specifications/task-management-execution.md
 */
import type { WorkspaceTreeSnapshot } from "../filesystem/WorkspaceTree.types";
import type { WorkspaceProcessReferences } from "../consumers/WorkspaceProcess.types";
import type {
  WorkspaceTask,
  WorkspaceArtifactManifest,
} from "../dossier/Dossier.types";
import type {
  WorkspaceFileWrite,
  WorkspaceOperationJournal,
  WorkspaceMetadataContext,
} from "../recovery/WorkspaceOperation.types";

export type WorkspaceCleanupItem = {
  artifactId: string;
  artifactRevision: number;
  path: string;
  snapshot: WorkspaceTreeSnapshot;
  coverage: WorkspaceProcessReferences;
};

/** Хеш связывает точный набор артефактов, снимки и ревизии исходных metadata. */
export type WorkspaceCleanupPlan = {
  schemaVersion: 1;
  requestId: string;
  localKey: string;
  localDossierId: string;
  taskRevision: number;
  manifestRevision: number;
  bodyHash: string;
  createdAt: string;
  items: WorkspaceCleanupItem[];
  hash: string;
};

/** Оценка выделенных блоков не равна освобождённым байтам при hardlinks. */
export type WorkspaceCleanupReceipt = {
  requestId: string;
  status: "completed";
  paths: string[];
  estimatedAllocatedBytes: number;
  completedAt: string;
};

/** Все before/after и пути фиксируются до первого rename. */
export type WorkspaceCleanupOperation = {
  phase: "prepared" | "publishing" | "completed";
  requestId: string;
  planPath: string;
  planHash: string;
  localDossierId: string;
  base: string;
  bodyHash: string;
  taskBefore: WorkspaceTask;
  manifestBefore: WorkspaceArtifactManifest;
  taskAfter: WorkspaceTask;
  manifestAfter: WorkspaceArtifactManifest;
  writes: WorkspaceFileWrite[];
  result: WorkspaceCleanupReceipt;
  items: (WorkspaceCleanupItem & {
    phase: "prepared" | "renaming" | "quarantined" | "purging" | "completed";
    quarantine: string;
  })[];
};

export type WorkspaceCleanupPlanResult = {
  plan: WorkspaceCleanupPlan;
  file: string;
  allocatedBytes: number;
};

export type WorkspaceCleanupOptions = {
  hook?: (
    phase: string,
    state:
      WorkspaceCleanupOperation | WorkspaceCleanupOperation["items"][number],
  ) => void;
  planPath?: string;
};

/** Legacy facade имеет только поля, необходимые для продолжения metadata, без нового pending. */
export type WorkspaceCleanupResumeContext = WorkspaceMetadataContext & {
  journal: Pick<WorkspaceOperationJournal, "phase" | "key" | "data"> | null;
};

export type LegacyWorkspaceCleanupJournal = Record<string, unknown> &
  Omit<
    WorkspaceCleanupOperation,
    | "requestId"
    | "planPath"
    | "localDossierId"
    | "base"
    | "writes"
    | "result"
    | "taskAfter"
    | "manifestAfter"
  > & {
    key: string;
    kind: "cleanup";
    result?: WorkspaceCleanupReceipt;
    taskAfter?: WorkspaceTask;
    manifestAfter?: WorkspaceArtifactManifest;
    metadataWrites?: WorkspaceFileWrite[];
    metadataCursor?: number;
  };
