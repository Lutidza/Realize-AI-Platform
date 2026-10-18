/**
 * @file tests/e2e/support/taskManagerAcceptance/createTaskManagerFixtureOptions.config.ts
 * @version 1.0.1
 * @date 2026-10-15
 * @description Выбирает явно назначенное локальное досье и уникальные каталоги одного browser запуска.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { TaskManagerFixtureOptions } from "./TaskManagerAcceptance.types";
import { normalizeFixtureDatabaseSource } from "./normalizeFixtureDatabaseSource.config";
/** Fixture не выбирает историческую задачу и не принимает legacy TASK автоматически. */
export function createTaskManagerFixtureOptions(
  environment: NodeJS.ProcessEnv,
  root = process.cwd(),
  runId = randomBytes(8).toString("hex"),
): TaskManagerFixtureOptions {
  const task = environment.TASK_BROWSER_TASK;
  if (!task) throw new Error("TASK_BROWSER_TASK_REQUIRED");
  if (
    !/^\.ai-workspace\/tasks\/[a-z0-9][a-z0-9-]{0,127}$/.test(task) ||
    !/^[a-f0-9]{16}$/.test(runId)
  )
    throw new Error("TASK_BROWSER_TASK_INVALID");
  const uri = environment.DATABASE_URI || environment.DATABASE_URL;
  if (!uri) throw new Error("TASK_BROWSER_DATABASE_REQUIRED");
  let source: URL;
  try {
    source = new URL(uri);
  } catch {
    throw new Error("TASK_BROWSER_DATABASE_INVALID");
  }
  source = normalizeFixtureDatabaseSource(source);
  const attempt = `task-browser-${runId}`;
  return {
    root: resolve(root),
    task,
    localKey: task.slice(".ai-workspace/tasks/".length),
    runId,
    attemptId: randomUUID(),
    source,
    paths: {
      logs: `logs/${attempt}`,
      screenshots: `screenshots/${attempt}`,
      temporary: `tmp/${attempt}`,
      distDir: `${task}/tmp/${attempt}/next`,
      lifecycleDirectory: `logs/${attempt}-lifecycle`,
      lifecycle: `logs/${attempt}-lifecycle/receipt.json`,
    },
  };
}
