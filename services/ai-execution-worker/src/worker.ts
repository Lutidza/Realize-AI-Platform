/**
 * @file services/ai-execution-worker/src/worker.ts
 * @version 1.7.0
 * @date 2026-11-27
 * @description Запускает managed worker или принимает одно ограниченное назначение через IPC оркестратора IDE.
 * @see documentation/specifications/internal-mcp.md
 */
if (process.argv[2] === "--ide-assignment") {
  if (!process.send) throw new Error("assignment_write_ipc_required");
  await import("./runIdeWriteAssignment.controller");
} else {
  await import("./serveManagedExecutionWorker.controller");
}

export {};
