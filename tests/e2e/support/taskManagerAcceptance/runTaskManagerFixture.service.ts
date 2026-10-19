/**
 * @file tests/e2e/support/taskManagerAcceptance/runTaskManagerFixture.service.ts
 * @version 1.1.0
 * @date 2026-10-19
 * @description Координирует browser этап, остановку ресурсов, сохранение evidence и точную producer cleanup.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { WorkspaceFs } from "../../../../.ai/tools/task-workspace/src/filesystem/WorkspaceFs.adapter.mjs";
import { withWorkspaceFileLock } from "../../../../.ai/tools/task-workspace/src/filesystem/withWorkspaceFileLock.adapter.mjs";
import {
  beginWorkspaceProducerGroup,
  finalizeWorkspaceProducerGroup,
} from "../../../../.ai/tools/task-workspace/src/producer-group/workspaceProducerGroup.index.mjs";
import type { WorkspaceOperationReference } from "../../../../.ai/tools/task-workspace/src/recovery/WorkspaceOperation.types";
import type {
  WorkspaceProducerGroup,
  WorkspaceProducerGroupFinalization,
} from "../../../../.ai/tools/task-workspace/src/producer-group/WorkspaceProducerGroup.types";
import {
  createFixtureReceiptCoordinator,
  readFixturePendingOperation,
} from "./createFixtureReceiptCoordinator.service";
import { fixtureFailureReason } from "./fixtureFailureReason.util";
import { createFixtureDatabase } from "./createFixtureDatabase.adapter";
import { startFixtureProcess } from "./FixtureProcess.adapter";
import { createFixtureIncludesGuard } from "./createFixtureIncludesGuard.adapter";
import { waitForFixtureServer } from "./waitForFixtureServer.service";
import { allocateFixturePort } from "./allocateFixturePort.adapter";
import { createFixtureProcessContainment } from "./FixtureProcessContainment.adapter";
import type { FixtureProcessContainment } from "./FixtureProcessContainment.types";
import { migrations } from "../../../../src/migrations";
import type { FixtureProcessHandle } from "./FixtureProcess.types";
import type { FixtureIncludesGuard } from "./FixtureIncludes.types";
import type {
  TaskManagerFixtureOptions,
  TaskManagerFixtureOutcome,
  TaskManagerFixtureResult,
  FixtureDatabaseSession,
  FixtureCleanupResult,
  TaskManagerFixtureLifecycle,
} from "./TaskManagerAcceptance.types";
import type { TaskManagerFixtureRuntime } from "./TaskManagerFixtureRuntime.types";
const defaults: TaskManagerFixtureRuntime = {
  processContainment: createFixtureProcessContainment,
  database: createFixtureDatabase,
  startProcess: startFixtureProcess,
  prepareIncludes: createFixtureIncludesGuard,
  allocatePort: allocateFixturePort,
  waitForServer: waitForFixtureServer,
};
const managedEnvironment = [
  "DATABASE_URI",
  "DATABASE_URL",
  "PAYLOAD_DB_PUSH",
  "REALIZE_AI_RUNTIME_ISOLATED",
  "REALIZE_PLATFORM_OWNER_USER_IDS",
  "TASK_BROWSER_PASSWORD",
];
/** Родительское TASK состояние остаётся у агента; fixture фиксирует только своё исполнение и artifacts. */
export async function runTaskManagerFixture(
  options: TaskManagerFixtureOptions,
  signal: AbortSignal,
  runtime: TaskManagerFixtureRuntime = defaults,
): Promise<TaskManagerFixtureResult> {
  const storage = new WorkspaceFs(options.root);
  const receiptPath = options.paths.lifecycle;
  const localKey = options.localKey;
  const producers = runtime.producerGroups ?? {
    begin: beginWorkspaceProducerGroup,
    finalize: finalizeWorkspaceProducerGroup,
  };
  try {
    const receipt = createFixtureReceiptCoordinator(
      storage,
      options,
      producers,
    );
    const finish = (
      outcome: TaskManagerFixtureOutcome,
      reason: string | null,
      resourceCleanup: FixtureCleanupResult,
      lifecycle: TaskManagerFixtureLifecycle,
    ): TaskManagerFixtureResult => {
      const receiptLifecycle = receipt.finish({
        outcome,
        reason,
        resourceCleanup,
        main: lifecycle,
      });
      const lifecycleStatus =
        lifecycle.status === "completed" &&
        receiptLifecycle.status === "completed"
          ? "completed"
          : "blocked";
      const exitCode =
        outcome === "cancelled"
          ? 130
          : outcome === "passed" && lifecycleStatus === "completed"
            ? 0
            : 1;
      console.log(
        `Task Manager fixture: ${outcome}; lifecycle ${lifecycleStatus}; receipt ${receiptLifecycle.status}`,
      );
      return {
        outcome,
        exitCode,
        lifecycleStatus,
        lifecycle,
        receiptLifecycle,
        receiptPath,
        resourceCleanup,
      };
    };
    let group: WorkspaceProducerGroup;
    try {
      group = producers.begin(storage, localKey, {
        stageId:
          options.profile === "access"
            ? "access-browser"
            : "task-manager-browser",
        attemptId: options.attemptId,
        artifacts: [
          {
            path: options.paths.logs,
            category: "log",
            retention: {
              mode: "retain",
              pinned: true,
              keepReason: "Доказательства браузерной проверки",
              referencedBy: [],
            },
          },
          {
            path: options.paths.screenshots,
            category: "screenshot",
            retention: {
              mode: "retain",
              pinned: true,
              keepReason: "Скриншоты браузерной проверки",
              referencedBy: [],
            },
          },
          {
            path: options.paths.temporary,
            category: "temporary",
            retention: {
              mode: "temporary",
              pinned: false,
              keepReason: null,
              referencedBy: [],
            },
          },
        ],
      });
    } catch (error) {
      let operation: WorkspaceOperationReference | null = null;
      let settlement: "unknown" | "not_started" = "unknown";
      try {
        operation = withWorkspaceFileLock(storage, localKey, () =>
          readFixturePendingOperation(storage, localKey),
        );
        if (!operation) settlement = "not_started";
      } catch {
        /* Отказ чтения не доказывает отсутствие незавершённой операции. */
      }
      const reason = fixtureFailureReason(error);
      return finish(
        "failed",
        reason,
        { quiescent: true, errors: [] },
        {
          stage: "begin",
          status: "blocked",
          reason,
          operation,
          settlement,
        },
      );
    }
    // После begin fixture владеет незавершёнными logs/screenshots/tmp: процессы и
    // fixture-result пишут только в них до остановки writers и последующего settle.
    console.log(
      `Task Manager browser evidence: ${resolve(options.root, options.task, options.paths.logs)}`,
    );
    const previous = new Map(
      managedEnvironment.map((key) => [key, process.env[key]]),
    );
    let database: FixtureDatabaseSession | undefined;
    let includes: FixtureIncludesGuard | undefined;
    let containment: FixtureProcessContainment | undefined;
    const processes: FixtureProcessHandle[] = [];
    let outcome: TaskManagerFixtureOutcome = "failed";
    let reason: string | null = null;
    let port: number | null = null;
    const errors: string[] = [];
    let processesQuiescent = true;
    const stopFailures = new Set<FixtureProcessHandle>();
    let stopPromise: Promise<void> | undefined;
    const stopProcesses = () =>
      (stopPromise ??= (async () => {
        for (const child of [...processes].reverse()) {
          try {
            await child.stop();
          } catch {
            processesQuiescent = false;
            stopFailures.add(child);
            errors.push("FIXTURE_PROCESS_STOP_FAILED");
          }
        }
      })());
    const abortProcesses = () => {
      void stopProcesses();
    };
    signal.addEventListener("abort", abortProcesses, { once: true });
    try {
      signal.throwIfAborted();
      containment = runtime.processContainment?.(process.env);
      const startProcess = containment?.startProcess ?? runtime.startProcess;
      includes = await runtime.prepareIncludes(
        options.root,
        options.paths.distDir,
      );
      port = await runtime.allocatePort();
      signal.throwIfAborted();
      process.env.TASK_BROWSER_PASSWORD = randomBytes(24).toString("base64url");
      database = runtime.database(options.source, options.runId);
      await database.initialize(signal);
      signal.throwIfAborted();
      const baseURL = `http://127.0.0.1:${port}`;
      const env = {
        ...process.env,
        DATABASE_URI: database.uri,
        DATABASE_URL: database.uri,
        PAYLOAD_DB_PUSH: "false",
        REALIZE_AI_RUNTIME_ISOLATED: "true",
        REALIZE_PLATFORM_OWNER_USER_IDS: "",
        PORT: String(port),
        REALIZE_NEXT_DIST_DIR: options.paths.distDir,
        NEXT_PUBLIC_SERVER_URL: baseURL,
        PAYLOAD_PUBLIC_SERVER_URL: baseURL,
        NEXT_PUBLIC_SITE_URL: baseURL,
        PAYLOAD_PUBLIC_SITE_URL: baseURL,
        PAYLOAD_PUBLIC_LIVE_PREVIEW_URL: baseURL,
      };
      const server = startProcess(
        [
          "node_modules/next/dist/bin/next",
          "dev",
          "--webpack",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(port),
        ],
        {
          cwd: options.root,
          env,
          logFile: resolve(
            options.root,
            options.task,
            options.paths.logs,
            "server.log",
          ),
        },
      );
      processes.push(server);
      await runtime.waitForServer(server, baseURL, signal);
      signal.throwIfAborted();
      const browser = startProcess(
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          options.profile === "access"
            ? "tests/e2e/access-management.spec.ts"
            : "tests/e2e/task-manager.spec.ts",
          "--project=chromium",
          "--workers=1",
          "--retries=0",
          "--reporter=line",
          `--output=${resolve(options.root, options.task, options.paths.logs, "playwright")}`,
        ],
        {
          cwd: options.root,
          env: {
            ...env,
            TASK_BROWSER_ACCEPTANCE:
              options.profile === "access" ? "false" : "true",
            ACCESS_BROWSER_ACCEPTANCE:
              options.profile === "access" ? "true" : "false",
            TASK_BROWSER_EVIDENCE_DIR: resolve(
              options.root,
              options.task,
              options.paths.screenshots,
            ),
            TASK_BROWSER_LOGS_DIR: resolve(
              options.root,
              options.task,
              options.paths.logs,
            ),
            TASK_BROWSER_TEMP_DIR: resolve(
              options.root,
              options.task,
              options.paths.temporary,
            ),
            PLAYWRIGHT_SKIP_WEB_SERVER: "true",
            PLAYWRIGHT_BASE_URL: baseURL,
          },
          logFile: resolve(
            options.root,
            options.task,
            options.paths.logs,
            "test.log",
          ),
        },
      );
      processes.push(browser);
      const code = await waitForBrowserCompletion(browser, signal);
      signal.throwIfAborted();
      outcome = code === 0 ? "passed" : "failed";
      if (code !== 0) reason = "TASK_BROWSER_TEST_FAILED";
    } catch (error) {
      outcome = signal.aborted ? "cancelled" : "failed";
      reason = signal.aborted
        ? "TASK_BROWSER_CANCELLED"
        : fixtureFailureReason(error);
      console.error(reason);
    } finally {
      signal.removeEventListener("abort", abortProcesses);
      await stopProcesses();
      try {
        const closed = await database?.close();
        if (closed && !closed.quiescent) {
          errors.push(...closed.errors);
          if (!closed.errors.length)
            errors.push("FIXTURE_DATABASE_NOT_QUIESCENT");
        }
      } catch {
        errors.push("FIXTURE_DATABASE_CLEANUP_FAILED");
      }
      try {
        const reaped = await containment?.reapResidualWriters();
        if (reaped && !reaped.quiescent) {
          processesQuiescent = false;
          errors.push(reaped.reason ?? "FIXTURE_CONTAINMENT_NOT_QUIESCENT");
        }
      } catch {
        processesQuiescent = false;
        errors.push("FIXTURE_CONTAINMENT_REAP_FAILED");
      }
      // Промежуточный stop может видеть ещё живые sibling/DB writers. Итог сверяем после закрытия всех ресурсов.
      for (const child of processes) {
        if (stopFailures.has(child)) continue;
        try {
          const confirmed = await child.confirmQuiescence();
          if (!confirmed.quiescent) {
            processesQuiescent = false;
            errors.push(confirmed.reason ?? "FIXTURE_PROCESS_NOT_QUIESCENT");
          }
        } catch {
          processesQuiescent = false;
          errors.push("FIXTURE_PROCESS_CONFIRM_FAILED");
        }
      }
      try {
        if (processesQuiescent) await includes?.restore();
        else errors.push("FIXTURE_INPUTS_RESTORE_BLOCKED_BY_PROCESS");
      } catch {
        errors.push("FIXTURE_TSCONFIG_RESTORE_FAILED");
      }
      for (const [key, value] of previous)
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    if (signal.aborted) {
      outcome = "cancelled";
      reason = "TASK_BROWSER_CANCELLED";
    } else if (errors.length) {
      outcome = "failed";
      reason ??= "TASK_BROWSER_RESOURCE_CLEANUP_FAILED";
    }
    const resourceCleanup = { quiescent: errors.length === 0, errors };
    let lifecycle: WorkspaceProducerGroupFinalization;
    try {
      // При pending bytes разрешены только отдельной заранее зарегистрированной квитанции.
      const operation = withWorkspaceFileLock(storage, localKey, () => {
        const pending = readFixturePendingOperation(storage, localKey);
        if (pending) return pending;
        storage.writeJson(
          `${options.task}/${options.paths.logs}/fixture-result.json`,
          {
            database: database?.name ?? null,
            port,
            distDir: options.paths.distDir,
            migrationCount: migrations.length,
            outcome,
            reason,
            resourceCleanup,
            lifecycleReceipt: receiptPath,
          },
        );
        return null;
      });
      if (operation) {
        lifecycle = {
          status: "blocked",
          artifactIds: group.artifactIds,
          reason: "operation_recovery_required",
          settlement: "unknown",
          phase: "preflight",
          operation,
          cleanup: {
            status: "blocked",
            paths: [options.paths.temporary],
            reason: "operation_recovery_required",
            planPath: null,
          },
        };
      } else {
        lifecycle = producers.finalize(storage, group, {
          quiescent: resourceCleanup.quiescent,
          cleanupTemporary: true,
        });
      }
    } catch (error) {
      let failedOperation: WorkspaceOperationReference | null = null;
      try {
        failedOperation = withWorkspaceFileLock(storage, localKey, () =>
          readFixturePendingOperation(storage, localKey),
        );
      } catch {
        /* Unknown phase сохраняет неопределённость, отдельная квитанция проверит свои guards. */
      }
      const failedReason = fixtureFailureReason(error);
      lifecycle = {
        status: "blocked",
        artifactIds: group.artifactIds,
        reason: failedReason,
        settlement: "unknown",
        phase: "unknown",
        operation: failedOperation,
        cleanup: {
          status: "blocked",
          paths: [options.paths.temporary],
          reason: failedReason,
          planPath: null,
        },
      };
    }
    return finish(outcome, reason, resourceCleanup, {
      stage: "finalize",
      ...lifecycle,
    });
  } finally {
    storage.close();
  }
}

/** Abort должен разомкнуть ожидание даже если unknown ownership запрещает сигнал живому процессу. */
async function waitForBrowserCompletion(
  browser: FixtureProcessHandle,
  signal: AbortSignal,
): Promise<number | null> {
  signal.throwIfAborted();
  let abort!: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(new Error("TASK_BROWSER_CANCELLED"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([browser.done, interrupted]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
