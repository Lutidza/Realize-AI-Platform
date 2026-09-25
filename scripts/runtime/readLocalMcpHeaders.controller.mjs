/**
 * @file scripts/runtime/readLocalMcpHeaders.controller.mjs
 * @version 1.0.0
 * @date 2026-09-24
 * @description Передаёт private заголовки Codex через штатный http_headers_helper без вывода credentials в диагностику.
 * @see documentation/architecture/mcp-tooling.md
 */
import { readLocalMcpHeaders } from "./readLocalMcpHeaders.service.mjs";

try {
  process.stdout.write(`${JSON.stringify(await readLocalMcpHeaders())}\n`);
} catch {
  process.stderr.write(
    "Локальный MCP credential недоступен; проверьте private конфигурацию установки.\n",
  );
  process.exitCode = 1;
}
