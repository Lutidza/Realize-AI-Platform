/**
 * @file .ai/tools/agent-search/acceptance/SearchAcceptanceProcess.adapter.mjs
 * @version 1.0.0
 * @date 2026-09-29
 * @description Ведёт только дочерние процессы приёмки, ограничивает логи и закрывает process groups.
 */
import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import { SEARCH_ACCEPTANCE_LIMITS as limits } from "./searchAcceptance.config.mjs";

export class SearchAcceptanceProcess {
  children = new Map();
  secrets = new Set();
  constructor(directory, env, signal) {
    this.directory = directory;
    this.env = env;
    this.signal = signal;
  }
  redact(value) {
    for (const secret of this.secrets)
      if (secret) value = value.replaceAll(secret, "[redacted]");
    return value;
  }
  async start(name, command, args, options = {}) {
    this.signal?.throwIfAborted();
    if (!/^[a-z0-9-]+$/.test(name))
      throw new Error("Недопустимое имя журнала приёмки");
    const file = await open(`${this.directory}/${name}.log`, "wx", 0o600);
    let child;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...this.env, ...options.env },
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      await file.close();
      throw error;
    }
    let bytes = 0,
      failure,
      killTimer;
    const stderr = [],
      stdout = [];
    const terminate = (signal = "SIGTERM") => {
      this.terminate(child, signal);
      killTimer ??= setTimeout(
        () => this.terminate(child, "SIGKILL"),
        options.killAfterMs ?? 10000,
      );
      killTimer.unref();
    };
    const consume = (chunk, output = false) => {
      bytes += chunk.length;
      if (bytes > limits.logBytes) {
        failure = new Error(`${name}: превышен лимит журнала`);
        terminate();
      } else (output ? stdout : stderr).push(chunk);
    };
    child.stdout.on("data", (chunk) => consume(chunk, true));
    child.stderr.on("data", (chunk) => consume(chunk));
    const timer = setTimeout(() => {
      failure = new Error(`${name}: превышено время проверки`);
      terminate();
    }, options.timeoutMs ?? limits.commandMs);
    timer.unref();
    const abort = () => {
      failure = new Error(`${name}: проверка отменена`);
      terminate();
    };
    this.signal?.addEventListener("abort", abort, { once: true });
    const done = new Promise((resolve) => {
      child.on("error", (error) => {
        failure = error;
      });
      child.on("close", async (code, signal) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        this.signal?.removeEventListener("abort", abort);
        // Раздельная сборка потоков сохраняет возможность скрыть секрет, разделённый несколькими chunks.
        const output = `${this.redact(Buffer.concat(stdout).toString("utf8"))}\n${this.redact(Buffer.concat(stderr).toString("utf8"))}`;
        try {
          await file.writeFile(output);
        } catch (error) {
          failure ??= error;
        }
        try {
          await file.close();
        } catch (error) {
          failure ??= error;
        }
        this.children.delete(child);
        resolve({
          code,
          signal,
          failure,
          output,
          stdout: this.redact(Buffer.concat(stdout).toString("utf8")),
        });
      });
    });
    const owned = { child, done, terminate };
    this.children.set(child, owned);
    if (this.signal?.aborted) abort();
    return owned;
  }
  async run(name, command, args, options) {
    const process = await this.start(name, command, args, options);
    const result = await process.done;
    if (result.failure || result.code !== 0)
      throw new Error(`${name}: ошибка; см. ${name}.log`, {
        cause: result.failure,
      });
    return result.stdout;
  }
  terminate(child, signal = "SIGTERM") {
    // Пока close не получен, потомки могут удерживать pipe даже после выхода leader-а.
    if (!this.children.has(child) || !child.pid) return;
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  async stop(owned, signal = "SIGTERM") {
    if (!this.children.has(owned.child)) return;
    owned.terminate(signal);
    await owned.done;
  }
  async close() {
    await Promise.all(
      [...this.children.values()].map((owned) => this.stop(owned)),
    );
  }
}
