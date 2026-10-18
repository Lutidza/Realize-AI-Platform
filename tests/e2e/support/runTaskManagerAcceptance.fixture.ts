/**
 * @file tests/e2e/support/runTaskManagerAcceptance.fixture.ts
 * @version 2.0.1
 * @date 2026-10-15
 * @description Запускает Task Manager browser этап в явно назначенном TASK с producer lifecycle и cleanup.
 * @see documentation/specifications/task-management-execution.md
 */
import nextEnv from "@next/env";
import { createTaskManagerFixtureOptions } from "./taskManagerAcceptance/createTaskManagerFixtureOptions.config";
import { runTaskManagerFixture } from "./taskManagerAcceptance/runTaskManagerFixture.service";
import { fixtureFailureReason } from "./taskManagerAcceptance/fixtureFailureReason.util";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const stopping = new AbortController();
const stop = () => stopping.abort();
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
try {
  const options = createTaskManagerFixtureOptions(process.env);
  const result = await runTaskManagerFixture(options, stopping.signal);
  process.exitCode = result.exitCode;
} catch (error) {
  const code = fixtureFailureReason(error);
  console.error(code);
  if (code === "TASK_BROWSER_TASK_REQUIRED")
    console.error(
      "Задай TASK_BROWSER_TASK=.ai-workspace/tasks/<localKey> для существующего managed TASK.",
    );
  process.exitCode = stopping.signal.aborted ? 130 : 1;
} finally {
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
