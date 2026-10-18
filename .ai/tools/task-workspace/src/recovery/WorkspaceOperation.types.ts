/**
 * @file .ai/tools/task-workspace/src/recovery/WorkspaceOperation.types.ts
 * @version 1.0.0
 * @date 2026-10-15
 * @description Описывает журнал операции, ссылки восстановления и контекст удерживаемой блокировки.
 * @see documentation/specifications/task-management-execution.md
 */
import type { WorkspaceFs } from "../filesystem/WorkspaceFs.adapter.mjs";

export type WorkspaceOperationKind =
  | "create"
  | "adopt"
  | "status"
  | "register"
  | "settle"
  | "result"
  | "plan-cleanup"
  | "cleanup"
  | "archive"
  | "reopen"
  | "producer-begin"
  | "producer-finalize";

/** Ссылка сообщает операцию и её расположение без содержимого закрытого журнала. */
export type WorkspaceOperationReference = {
  operationId: string;
  key: string;
  kind: WorkspaceOperationKind;
  phase: string;
  path: string;
  legacy?: boolean;
  ownerPhase?: string;
  planPath?: string;
  planHash?: string;
  requestId?: string;
};

/** Авторитетная запись одной операции; собственные подфазы принадлежат data. */
export type WorkspaceOperationJournal = {
  schemaVersion: 1;
  operationId: string;
  key: string;
  kind: WorkspaceOperationKind;
  inputHash: string;
  input: unknown;
  localDossierId: string;
  phase: "prepared" | "completed";
  data: Record<string, unknown>;
  result?: unknown;
};

/** Индекс связывает прежний журнал с ключом; подтверждённый план не заменяет исходный журнал. */
export type WorkspaceLegacyReference = WorkspaceOperationReference & {
  legacy: true;
  completed: boolean;
  localDossierId: string;
  planHash?: string;
  planPath?: string;
};

export type WorkspaceLegacyOperation = {
  reference: WorkspaceLegacyReference;
  journal: Record<string, unknown>;
};

export type WorkspaceLegacyCleanupBinding = {
  operationId: string;
  planPath: string;
  planHash: string;
  localDossierId: string;
};

export type WorkspaceMutationOptions = {
  kind: WorkspaceOperationKind;
  operationId?: string;
  input: unknown;
  legacy?: WorkspaceLegacyCleanupBinding;
  checkCompletedIdentity?: (localDossierId: string) => void;
};

/** prepare должен содержать все исходные/целевые состояния до первого побочного эффекта. */
export type WorkspaceOperationPreparation = {
  localDossierId: string;
  data: Record<string, unknown>;
  result?: unknown;
};

export type WorkspaceMutationContext<TResult = unknown> = {
  key: string;
  operationId: string;
  journal: WorkspaceOperationJournal | null;
  legacy: WorkspaceLegacyOperation | null;
  prepare(input: WorkspaceOperationPreparation): WorkspaceOperationJournal;
  save(): void;
  complete(result: TResult): TResult;
};

export type WorkspaceRecoveryHandlers = Partial<
  Record<
    WorkspaceOperationKind,
    (storage: WorkspaceFs, context: WorkspaceMutationContext) => unknown
  >
>;

/** Точное UTF-8 состояние before=null означает исходное отсутствие файла. */
export type WorkspaceFileWrite = {
  path: string;
  before: string | null;
  after: string;
};

/** Прежний обработчик сохраняет свой формат через save, сохраняя тот же контракт записи метаданных. */
export type WorkspaceMetadataContext = {
  journal: Pick<WorkspaceOperationJournal, "phase" | "data"> | null;
  save(): void;
};

export type WorkspaceRecoveryIndex = {
  schemaVersion: 1;
  phase: "building" | "ready";
  files: string[];
  cursor: number;
};
