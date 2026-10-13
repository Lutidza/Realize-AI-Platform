/**
 * @file tests/e2e/support/taskManagerAcceptance/waitForFixtureServer.service.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Ожидает собственный Next health и прогревает Task Manager с bounded cancellation.
 * @see documentation/specifications/task-management-execution.md
 */
import { setTimeout as delay } from "node:timers/promises";
import type { FixtureProcessHandle } from "./FixtureProcess.types";
/** Читает только назначенный loopback сервер, не изменяет рабочую установку. */
export async function waitForFixtureServer(
  server: FixtureProcessHandle,
  baseURL: string,
  signal: AbortSignal,
): Promise<void> {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    signal.throwIfAborted();
    if (
      !server.child.pid ||
      server.child.exitCode !== null ||
      server.child.signalCode !== null
    )
      throw new Error("TASK_BROWSER_SERVER_EXITED");
    try {
      const response = await fetch(`${baseURL}/api/health/live`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
      });
      await response.body?.cancel();
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(1000, undefined, { signal });
  }
  if (!ready) throw new Error("TASK_BROWSER_SERVER_NOT_READY");
  const response = await fetch(`${baseURL}/system/task-manager`, {
    redirect: "manual",
    signal: AbortSignal.any([signal, AbortSignal.timeout(240000)]),
  });
  await response.body?.cancel();
  if (response.status >= 500) throw new Error("TASK_BROWSER_WARMUP_FAILED");
}
