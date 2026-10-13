/**
 * @file tests/e2e/support/taskManagerAcceptance/allocateFixturePort.adapter.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Запрашивает свободный loopback порт для собственного Next процесса fixture.
 * @see documentation/specifications/task-management-execution.md
 */
import { createServer } from "node:net";
/** bind Next остаётся окончательной проверкой: чужой listener никогда не останавливается. */
export function allocateFixturePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const listener = createServer();
    listener.once("error", fail);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      if (!address || typeof address === "string") {
        listener.close();
        fail(new Error("FIXTURE_PORT_UNAVAILABLE"));
        return;
      }
      listener.close((error) => (error ? fail(error) : ok(address.port)));
    });
  });
}
