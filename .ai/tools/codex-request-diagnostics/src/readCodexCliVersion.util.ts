/**
 * @file .ai/tools/codex-request-diagnostics/src/readCodexCliVersion.util.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Читает версию диагностируемого CLI без открытия сессии.
 */
import { spawnSync } from "node:child_process";

/** В отчёт попадает только номер сборки. Произвольный вывод процесса остаётся за его границей. */
export function readCodexCliVersion(): string | null {
  const result = spawnSync("codex", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
    killSignal: "SIGKILL",
    maxBuffer: 1024,
  });
  if (result.status !== 0 || result.error) return null;
  return (
    /^codex-cli (\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)$/u.exec(
      result.stdout.trim(),
    )?.[1] ?? null
  );
}
