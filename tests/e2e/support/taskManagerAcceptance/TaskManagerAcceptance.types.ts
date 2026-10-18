/**
 * @file tests/e2e/support/taskManagerAcceptance/TaskManagerAcceptance.types.ts
 * @version 1.0.1
 * @date 2026-10-15
 * @description Задаёт границы browser fixture, outcomes и подтверждённой остановки её ресурсов.
 * @see documentation/specifications/task-management-execution.md
 */
import type { WorkspaceProducerGroupFinalization } from "../../../../.ai/tools/task-workspace/src/producer-group/WorkspaceProducerGroup.types";
import type { WorkspaceOperationReference } from "../../../../.ai/tools/task-workspace/src/recovery/WorkspaceOperation.types";
import type { WorkspaceProcessReferences } from "../../../../.ai/tools/task-workspace/src/consumers/WorkspaceProcess.types";

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
    lifecycleDirectory: string;
    lifecycle: string;
  };
};
export type TaskManagerFixtureOutcome = "passed" | "failed" | "cancelled";
export type FixtureCleanupResult = { quiescent: boolean; errors: string[] };
export type TaskManagerFixtureResult = {
  outcome: TaskManagerFixtureOutcome;
  exitCode: number;
  lifecycleStatus: "completed" | "blocked";
  lifecycle: TaskManagerFixtureLifecycle;
  receiptLifecycle: FixtureReceiptResult;
  receiptPath: string;
  resourceCleanup: FixtureCleanupResult;
};
export type FixtureDatabaseSession = {
  name: string;
  uri: string;
  initialize(signal: AbortSignal): Promise<void>;
  close(): Promise<FixtureCleanupResult>;
};

/** Begin может отказать без handle; незавершённая операция не выдаётся за отсутствие эффекта. */
export type TaskManagerFixtureLifecycle =
  | {
      stage: "begin";
      status: "blocked";
      reason: string;
      settlement: "not_started" | "unknown";
      operation: WorkspaceOperationReference | null;
    }
  | ({ stage: "finalize" } & WorkspaceProducerGroupFinalization);

/** Квитанция описывает известное состояние до её отдельного settle; её bytes после settle не меняются. */
export type TaskManagerFixtureReceipt = {
  schemaVersion: 1;
  attemptId: string;
  outcome: TaskManagerFixtureOutcome;
  reason: string | null;
  resourceCleanup: FixtureCleanupResult;
  main: TaskManagerFixtureLifecycle;
  receipt: {
    artifactIds: readonly string[];
    state: "open";
    writersQuiescent: true;
    writerCoverage: FixtureReceiptWriterCoverage;
    operation: WorkspaceOperationReference | null;
  };
};

/** Недоступные посторонние процессы ограничивают покрытие, но не являются обнаруженными writers. */
export type FixtureReceiptWriterCoverage = Pick<
  WorkspaceProcessReferences,
  "inaccessible" | "scope"
> & { referenceCount: number };

/** Состояние записи и отдельного settle квитанции подтверждается раздельно. */
export type FixtureReceiptResult = {
  path: string;
  artifactIds: readonly string[];
  writersQuiescent: boolean;
  writerCoverage: FixtureReceiptWriterCoverage | null;
  settlement: "unsettled" | "partial" | "settled" | "unknown";
  reason: string | null;
  operation: WorkspaceOperationReference | null;
  finalization: WorkspaceProducerGroupFinalization | null;
} & (
  | {
      status: "completed";
      writeState: "written";
      settlement: "settled";
      reason: null;
      operation: null;
    }
  | { status: "open"; writeState: "written" }
  | { status: "unwritten"; writeState: "unwritten" }
  | { status: "unknown"; writeState: "unknown" }
);
