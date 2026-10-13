/**
 * @file tests/e2e/support/taskManagerAcceptance/TaskManagerAcceptance.types.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Задаёт границы browser fixture, outcomes и подтверждённой остановки её ресурсов.
 * @see documentation/specifications/task-management-execution.md
 */
export type TaskManagerFixtureOptions = {
  root: string;
  task: string;
  localKey: string;
  runId: string;
  attemptId: string;
  source: URL;
  paths: {
    logs: string;
    screenshots: string;
    temporary: string;
    distDir: string;
    lifecycle: string;
  };
};
export type TaskManagerFixtureOutcome = "passed" | "failed" | "cancelled";
export type FixtureCleanupResult = { quiescent: boolean; errors: string[] };
export type TaskManagerFixtureResult = {
  outcome: TaskManagerFixtureOutcome;
  exitCode: number;
  lifecycleStatus: string;
  resourceCleanup: FixtureCleanupResult;
};
export type FixtureDatabaseSession = {
  name: string;
  uri: string;
  initialize(signal: AbortSignal): Promise<void>;
  close(): Promise<FixtureCleanupResult>;
};
