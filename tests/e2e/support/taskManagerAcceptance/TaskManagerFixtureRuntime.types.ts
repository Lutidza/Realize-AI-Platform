/**
 * @file tests/e2e/support/taskManagerAcceptance/TaskManagerFixtureRuntime.types.ts
 * @version 1.0.1
 * @date 2026-10-15
 * @description Определяет зависимости оркестратора для isolated проверок error и interruption без рабочей БД.
 * @see documentation/specifications/task-management-execution.md
 */
import type { FixtureDatabaseSession } from "./TaskManagerAcceptance.types";
import type { FixtureIncludesGuard } from "./FixtureIncludes.types";
import type { createFixtureProcessContainment } from "./FixtureProcessContainment.adapter";
import type {
  FixtureProcessHandle,
  FixtureProcessOptions,
} from "./FixtureProcess.types";
import type { WorkspaceFs } from "../../../../.ai/tools/task-workspace/src/filesystem/WorkspaceFs.adapter.mjs";
import type {
  WorkspaceProducerGroup,
  WorkspaceProducerGroupInput,
  WorkspaceProducerGroupFinalizationInput,
  WorkspaceProducerGroupFinalization,
} from "../../../../.ai/tools/task-workspace/src/producer-group/WorkspaceProducerGroup.types";

/** Изолированные проверки оборачивают реальные owners, сохраняя их guards и process-local handles. */
export type TaskManagerFixtureProducers = {
  begin(
    storage: WorkspaceFs,
    key: string,
    input: WorkspaceProducerGroupInput,
  ): WorkspaceProducerGroup;
  finalize(
    storage: WorkspaceFs,
    group: WorkspaceProducerGroup,
    input: WorkspaceProducerGroupFinalizationInput,
  ): WorkspaceProducerGroupFinalization;
};

export type TaskManagerFixtureRuntime = {
  producerGroups?: TaskManagerFixtureProducers;
  processContainment?: typeof createFixtureProcessContainment;
  database(source: URL, runId: string): FixtureDatabaseSession;
  startProcess(
    args: string[],
    options: FixtureProcessOptions,
  ): FixtureProcessHandle;
  prepareIncludes(root: string, distDir: string): Promise<FixtureIncludesGuard>;
  allocatePort(): Promise<number>;
  waitForServer(
    server: FixtureProcessHandle,
    url: string,
    signal: AbortSignal,
  ): Promise<void>;
};
