/**
 * @file .ai/tools/task-workspace/test/OrdinaryRecovery.types.ts
 * @version 1.0.0
 * @date 2026-10-15
 * @description Описывает изолированные сценарии прерываний и проверяемую часть подготовленного журнала.
 * @see documentation/specifications/task-management-execution.md
 */
import type { WorkspaceFs } from "../src/filesystem/WorkspaceFs.adapter.mjs";
import type {
  WorkspaceOperationJournal,
  WorkspaceFileWrite,
} from "../src/recovery/WorkspaceOperation.types";

/** Сценарий удерживает исходный вход при replay, включая artifactId settlement. */
export type OrdinaryRecoveryScenario = {
  name: string;
  effects: number;
  artifactId?: string;
  setup(storage: WorkspaceFs): void;
  invoke(
    storage: WorkspaceFs,
    options: { operationId: string },
    changed?: boolean,
  ): unknown;
};

/** Тест читает этот план после assertion наличия массива metadata writes. */
export type OrdinaryRecoveryJournal = WorkspaceOperationJournal & {
  data: { writes: WorkspaceFileWrite[]; result: unknown };
};
