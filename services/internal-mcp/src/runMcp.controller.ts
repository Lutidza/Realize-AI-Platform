/**
 * @file services/internal-mcp/src/runMcp.controller.ts
 * @version 1.0.1
 * @date 2026-09-24
 * @description Запускает явно выбранный режим MCP и завершает собственный listener и зависимости по сигналу.
 */
import { createMcpHttpServer } from "./createMcpHttpServer.controller";
import { createBootstrapMcpRuntime } from "./createBootstrapMcpRuntime.config";
import type { McpRuntimeOptions } from "./McpRuntime.types";

const stopping = new AbortController();
let force: ReturnType<typeof setTimeout> | undefined;
const shutdown = () => {
  stopping.abort();
  force ??= setTimeout(() => process.exit(1), 5000);
  force.unref();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
let listener: Awaited<ReturnType<typeof createMcpHttpServer>> | undefined;
let closePayload: (() => Promise<void>) | undefined;
try {
  let options: McpRuntimeOptions;
  let startManaged: (() => Promise<void>) | undefined;
  if (process.env.REALIZE_MCP_CONFIGURATION_MODE === "bootstrap")
    options = await createBootstrapMcpRuntime(process.env);
  else if (process.env.REALIZE_MCP_CONFIGURATION_MODE === "managed") {
    // Named export сохраняется и после production preload под tsx; default CJS interop может отсутствовать.
    const nextEnvironment = await import("@next/env");
    nextEnvironment.loadEnvConfig(
      process.cwd(),
      process.env.NODE_ENV !== "production",
      {
        info: () => undefined,
        error: () => {
          throw new Error("MCP environment load failed.");
        },
      },
    );
    const [{ openMcpPayload }, { createManagedMcpRuntime }] = await Promise.all(
      [
        import("./openMcpPayload.adapter"),
        import("./createManagedMcpRuntime.config"),
      ],
    );
    const payload = await openMcpPayload();
    closePayload = () => payload.destroy();
    const managed = await createManagedMcpRuntime(payload);
    options = managed.options;
    startManaged = managed.start;
  } else throw new Error("Explicit MCP configuration mode is required.");
  stopping.signal.throwIfAborted();
  listener = await createMcpHttpServer(options);
  await startManaged?.();
  console.error(`[mcp] Listener готов: ${listener.origin}/mcp`);
  if (!stopping.signal.aborted)
    await new Promise<void>((resolve) =>
      stopping.signal.addEventListener("abort", () => resolve(), {
        once: true,
      }),
    );
} catch {
  console.error(
    "[mcp] Запуск или работа прерваны. Проверьте режим, профиль, port и миграции; секреты и детали подключения не выводятся.",
  );
  process.exitCode = 1;
} finally {
  await listener?.close();
  await closePayload?.();
  if (force) clearTimeout(force);
  process.removeListener("SIGINT", shutdown);
  process.removeListener("SIGTERM", shutdown);
}
