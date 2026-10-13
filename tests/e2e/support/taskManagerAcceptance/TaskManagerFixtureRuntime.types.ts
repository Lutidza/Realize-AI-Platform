/**
 * @file tests/e2e/support/taskManagerAcceptance/TaskManagerFixtureRuntime.types.ts
 * @version 1.0.0
 * @date 2026-10-13
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
export type TaskManagerFixtureRuntime = {
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
