/**
 * @file .ai/tools/agent-search/src/readRipgrepFrames.adapter.mjs
 * @version 1.0.0
 * @date 2026-09-26
 * @description Читает ограниченные frames rg с backpressure и закрывает процесс при выходе.
 */
import { spawn } from "node:child_process";
import { SEARCH_LIMITS } from "./searchProfiles.config.mjs";

/** Прерывание обхода iterator закрывает rg; signal общий для всех стадий поиска. */
export async function* readRipgrepFrames(args, { root, delimiter, signal }) {
  signal.throwIfAborted();
  const child = spawn("rg", args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  let pending = Buffer.alloc(0);
  let diagnostics = Buffer.alloc(0);
  let spawnFailure;
  let finished = false;
  let stopping = false;
  let forceTimer;
  const closed = new Promise((resolve) => {
    child.once("error", (error) => {
      spawnFailure =
        error.code === "ENOENT"
          ? "ripgrep (rg) не установлен."
          : `Не удалось запустить rg: ${error.code ?? "ошибка процесса"}`;
    });
    child.once("close", (code, processSignal) => {
      finished = true;
      resolve({ code, processSignal });
    });
  });
  const stop = () => {
    if (finished || stopping) return;
    stopping = true;
    child.kill("SIGTERM");
    forceTimer = setTimeout(() => child.kill("SIGKILL"), 250);
    forceTimer.unref();
  };
  child.stderr.on("data", (chunk) => {
    if (diagnostics.length < SEARCH_LIMITS.diagnosticBytes)
      diagnostics = Buffer.concat([diagnostics, chunk]).subarray(
        0,
        SEARCH_LIMITS.diagnosticBytes,
      );
  });
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  try {
    for await (const chunk of child.stdout) {
      signal.throwIfAborted();
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let offset = 0;
      while (true) {
        const end = pending.indexOf(delimiter, offset);
        if (end < 0) break;
        if (end - offset > SEARCH_LIMITS.frameBytes) throw frameFailure();
        yield pending.subarray(offset, end);
        signal.throwIfAborted();
        offset = end + 1;
      }
      pending = Buffer.from(pending.subarray(offset));
      if (pending.length > SEARCH_LIMITS.frameBytes) throw frameFailure();
    }
    const { code, processSignal } = await closed;
    signal.throwIfAborted();
    const failure =
      spawnFailure ??
      (code > 1
        ? `rg завершился с кодом ${code}.`
        : processSignal
          ? `rg остановлен сигналом ${processSignal}.`
          : pending.length
            ? "Незавершённый поток результата rg."
            : undefined);
    if (failure) {
      const detail = diagnostics
        .toString("utf8")
        .trim()
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/gu, "?");
      throw new Error(`${failure}${detail ? `\n${detail}` : ""}`);
    }
  } finally {
    stop();
    await closed;
    clearTimeout(forceTimer);
    signal.removeEventListener("abort", stop);
  }
}

function frameFailure() {
  return Object.assign(
    new Error(
      "Строка результата rg превышает 1 MiB; сузьте запрос или используйте --output=files.",
    ),
    { reason: "frame" },
  );
}
