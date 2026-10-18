/**
 * @file tests/e2e/support/taskManagerAcceptance/createFixtureReceiptCoordinator.service.ts
 * @version 1.0.1
 * @date 2026-10-16
 * @description Регистрирует квитанцию до ресурсов и завершает её отдельно, сохраняя bytes-only диагностику при pending.
 * @see documentation/specifications/task-management-execution.md
 */
import { resolve } from "node:path";
import type { WorkspaceFs } from "../../../../.ai/tools/task-workspace/src/filesystem/WorkspaceFs.adapter.mjs";
import { withWorkspaceFileLock } from "../../../../.ai/tools/task-workspace/src/filesystem/withWorkspaceFileLock.adapter.mjs";
import { safeRelative } from "../../../../.ai/tools/task-workspace/src/filesystem/safeRelative.validator.mjs";
import { readWorkspaceProcesses } from "../../../../.ai/tools/task-workspace/src/consumers/readWorkspaceProcesses.adapter.mjs";
import type { WorkspaceProcessReferences } from "../../../../.ai/tools/task-workspace/src/consumers/WorkspaceProcess.types";
import {
  readWorkspaceOperationState,
  workspaceOperationReference,
} from "../../../../.ai/tools/task-workspace/src/recovery/WorkspaceOperation.repository.mjs";
import type { WorkspaceOperationReference } from "../../../../.ai/tools/task-workspace/src/recovery/WorkspaceOperation.types";
import { requireProducerGroup } from "../../../../.ai/tools/task-workspace/src/producer-group/WorkspaceProducerGroup.repository.mjs";
import { fail } from "../../../../.ai/tools/task-workspace/src/Workspace.error.mjs";
import type {
  TaskManagerFixtureOptions,
  TaskManagerFixtureReceipt,
  FixtureReceiptResult,
} from "./TaskManagerAcceptance.types";
import type { TaskManagerFixtureProducers } from "./TaskManagerFixtureRuntime.types";
import type { FixtureReceiptCoordinator } from "./FixtureReceipt.types";
import { fixtureFailureReason } from "./fixtureFailureReason.util";

/** Вызывается под task lock; чтение pending не выдаёт права на metadata mutations. */
export function readFixturePendingOperation(
  storage: WorkspaceFs,
  key: string,
): WorkspaceOperationReference | null {
  const state = readWorkspaceOperationState(storage, key);
  return state.pending
    ? workspaceOperationReference(state.pending)
    : (state.legacy.find((entry) => !entry.completed) ?? null);
}

/** Одно зарегистрированное retained+pinned дерево получает только собственные синхронные bytes. */
export function createFixtureReceiptCoordinator(
  storage: WorkspaceFs,
  options: TaskManagerFixtureOptions,
  producers: TaskManagerFixtureProducers,
  readProcessReferences: (
    absolute: string,
  ) => WorkspaceProcessReferences = readWorkspaceProcesses,
): FixtureReceiptCoordinator {
  const directory = safeRelative(options.paths.lifecycleDirectory);
  const file = safeRelative(options.paths.lifecycle);
  const localKey = options.localKey;
  const attemptId = options.attemptId;
  if (!directory.startsWith("logs/") || file !== `${directory}/receipt.json`)
    fail("fixture_receipt_path_invalid");
  const group = producers.begin(storage, localKey, {
    stageId: "task-manager-browser-receipt",
    attemptId,
    artifacts: [
      {
        path: directory,
        category: "log",
        retention: {
          mode: "retain",
          pinned: true,
          keepReason: "Квитанция жизненного цикла браузерной проверки",
          referencedBy: [],
        },
      },
    ],
  });
  return {
    finish(input) {
      let operation: WorkspaceOperationReference | null = null;
      let writersQuiescent = false;
      let writerCoverage: FixtureReceiptResult["writerCoverage"] = null;
      let settlement: FixtureReceiptResult["settlement"] = "unknown";
      let writeState: FixtureReceiptResult["writeState"] = "unwritten";
      let expected: string | undefined;
      let target: string | undefined;
      const blocked = (
        reason: string,
        finalization: FixtureReceiptResult["finalization"] = null,
      ): FixtureReceiptResult => {
        const common = {
          path: file,
          artifactIds: group.artifactIds,
          writersQuiescent,
          writerCoverage,
          settlement,
          reason,
          operation,
          finalization,
        };
        if (writeState === "written")
          return { ...common, status: "open", writeState };
        if (writeState === "unwritten")
          return { ...common, status: "unwritten", writeState };
        return { ...common, status: "unknown", writeState };
      };
      try {
        withWorkspaceFileLock(storage, localKey, () => {
          operation = readFixturePendingOperation(storage, localKey);
          // Общий pending запрещает metadata, но не bytes собственного подтверждённого open producer.
          const current = requireProducerGroup(storage, group);
          const artifact = current.artifacts[0];
          if (
            current.artifacts.length !== 1 ||
            artifact.path !== directory ||
            artifact.category !== "log" ||
            artifact.state !== "ready" ||
            artifact.producer.settled ||
            artifact.retention.mode !== "retain" ||
            !artifact.retention.pinned
          )
            fail("fixture_receipt_owner_changed");
          settlement = "unsettled";
          const writers = readProcessReferences(
            resolve(storage.root, current.dossier.base, directory),
          );
          writerCoverage = {
            referenceCount: writers.references.length,
            inaccessible: writers.inaccessible,
            scope: writers.scope,
          };
          // Квитанцию пишет только синхронный coordinator; путь не передаётся children.
          // Посторонние недоступные /proc отражают границы scan, а не найденных writers.
          if (writers.references.length)
            fail("fixture_receipt_writers_unconfirmed");
          writersQuiescent = true;
          const receipt: TaskManagerFixtureReceipt = {
            schemaVersion: 1,
            attemptId,
            ...input,
            receipt: {
              artifactIds: group.artifactIds,
              state: "open",
              writersQuiescent: true,
              writerCoverage,
              operation,
            },
          };
          target = `${current.dossier.base}/${file}`;
          expected = JSON.stringify(receipt, null, 2) + "\n";
          storage.write(target, expected, true);
          writeState = "written";
        });
        if (operation) return blocked("operation_recovery_required");
        const finalization = producers.finalize(storage, group, {
          quiescent: true,
          cleanupTemporary: false,
        });
        settlement = finalization.settlement;
        if (finalization.status === "completed")
          return {
            status: "completed",
            writeState: "written",
            path: file,
            artifactIds: group.artifactIds,
            writersQuiescent,
            writerCoverage,
            settlement: "settled",
            reason: null,
            operation: null,
            finalization,
          };
        operation = finalization.operation;
        return blocked(finalization.reason, finalization);
      } catch (error) {
        // Ошибка после fsync может означать сохранённые bytes; отсутствие подтверждения отражается явно.
        if (target && expected !== undefined) {
          try {
            writeState = !storage.exists(target)
              ? "unwritten"
              : storage.read(target, 1024 * 1024).toString("utf8") === expected
                ? "written"
                : "unknown";
          } catch {
            writeState = "unknown";
          }
        }
        try {
          operation = withWorkspaceFileLock(storage, localKey, () =>
            readFixturePendingOperation(storage, localKey),
          );
        } catch {
          /* Последняя подтверждённая ссылка остаётся доступной при отказе повторного чтения. */
        }
        return blocked(fixtureFailureReason(error));
      }
    },
  };
}
