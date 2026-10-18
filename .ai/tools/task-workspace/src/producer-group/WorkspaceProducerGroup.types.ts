/**
 * @file .ai/tools/task-workspace/src/producer-group/WorkspaceProducerGroup.types.ts
 * @version 1.0.3
 * @date 2026-10-15
 * @description Описывает caller-controlled producer group и проверяемый итог её точечной финализации.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  WorkspaceArtifact,
  WorkspaceArtifactManifest,
} from "@realize/payload-task-manager/workspace-contracts";
import type { WorkspaceCleanupReceipt } from "../cleanup/WorkspaceCleanup.types.ts";
import type { ManagedWorkspaceDossier } from "../dossier/Dossier.types.ts";
import type {
  WorkspaceFileWrite,
  WorkspaceOperationReference,
} from "../recovery/WorkspaceOperation.types.ts";

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

/** Partial подтверждает manifest settle без достигнутого TASK; unknown не подменяет отсутствие проверки. */
export type WorkspaceProducerSettlement =
  "unsettled" | "partial" | "settled" | "unknown";

export type WorkspaceProducerFinalizationPhase =
  "preflight" | "settlement" | "cleanup" | "completed" | "unknown";

/** Только завершённая очистка выдаёт конкретную квитанцию. */
export type WorkspaceProducerCleanupCompleted = {
  status: "completed";
  paths: readonly string[];
  planPath: string;
  receipt: WorkspaceCleanupReceipt;
};

export type WorkspaceProducerCleanupSkipped = {
  status: "not_requested" | "not_needed";
  paths: readonly string[];
  planPath: null;
};

export type WorkspaceProducerCleanupBlocked = {
  status: "blocked";
  paths: readonly string[];
  reason: string;
  planPath: string | null;
};

/** Completed подтверждает settlement, а не только отсутствие ошибки JavaScript. */
export type WorkspaceProducerFinalizationCompleted = {
  status: "completed";
  artifactIds: readonly string[];
  settlement: "settled";
  phase: "completed";
  operation: null;
  cleanup: WorkspaceProducerCleanupCompleted | WorkspaceProducerCleanupSkipped;
};

/** Blocked описывает только проверенный readback; ссылка может вести к чужой блокирующей операции. */
export type WorkspaceProducerFinalizationBlocked = {
  status: "blocked";
  artifactIds: readonly string[];
  reason: string;
  settlement: WorkspaceProducerSettlement;
  phase: WorkspaceProducerFinalizationPhase;
  operation: WorkspaceOperationReference | null;
  cleanup: WorkspaceProducerCleanupBlocked;
};

export type WorkspaceProducerGroupFinalization =
  WorkspaceProducerFinalizationCompleted | WorkspaceProducerFinalizationBlocked;

/** Снимок собственных записей не привязан к общей revision. Requests сохраняют только ссылки, не итоги. */
export type WorkspaceProducerGroupBinding = {
  artifacts: WorkspaceArtifact[];
  operation?: WorkspaceOperationReference;
  requests: Map<string, WorkspaceOperationReference>;
};

/** Внутреннее подтверждение строится из durable journal и фактических metadata под lock. */
export type WorkspaceProducerFinalizationProgress = {
  settlement: WorkspaceProducerSettlement;
  phase: WorkspaceProducerFinalizationPhase;
  operation: WorkspaceOperationReference | null;
  planPath: string | null;
  artifacts: WorkspaceArtifact[] | null;
};

export type WorkspaceProducerGroupContext = {
  dossier: ManagedWorkspaceDossier;
  manifest: WorkspaceArtifactManifest;
  artifacts: WorkspaceArtifact[];
  binding: WorkspaceProducerGroupBinding;
};

/** Строковые inode/dev сохраняются в JSON без потери точности. */
export type WorkspaceProducerDirectoryIdentity = { dev: string; ino: string };

export type WorkspaceProducerDirectoryPlan = {
  path: string;
  state: "existing" | "pending" | "created";
  identity: WorkspaceProducerDirectoryIdentity | null;
};

/** Данные begin сохраняют исходный набор артефактов; recovery не создаёт WeakMap handle. */
export type WorkspaceProducerBeginOperation = {
  kind: "begin";
  phase: "directories" | "metadata" | "completed";
  base: string;
  directories: WorkspaceProducerDirectoryPlan[];
  artifacts: WorkspaceArtifact[];
  result: WorkspaceProducerGroup;
};

export type WorkspaceProducerFinalizeOperation = {
  kind: "finalize";
  phase: "metadata" | "cleanup" | "completed";
  base: string;
  artifactIds: readonly string[];
  artifacts: WorkspaceArtifact[];
  result: WorkspaceProducerFinalizationCompleted;
};

export type WorkspaceProducerOperation =
  WorkspaceProducerBeginOperation | WorkspaceProducerFinalizeOperation;

export type WorkspaceProducerOperationData = {
  absentPaths: string[];
  producer: WorkspaceProducerOperation;
  producerMetadataCursorWrites: WorkspaceFileWrite[];
  producerMetadataCursor?: number;
};
