/**
 * @file packages/verification-runtime/src/runVerificationProcess.adapter.ts
 * @version 1.1.0
 * @date 2026-10-22
 * @description Исполняет node/npm без shell и завершает всю группу с ограниченным grace при отмене или timeout.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type {
  VerificationCheck,
  VerificationCheckpoint,
  VerificationOptions,
  VerificationProcessResult,
} from "./Verification.types.ts";
import { redactVerificationOutput } from "./redactVerificationOutput.util.ts";

export async function runVerificationProcess(
  root: string,
  check: VerificationCheck,
  checkpoint: VerificationCheckpoint,
  options: VerificationOptions,
): Promise<VerificationProcessResult> {
  return new Promise((resolve) => {
    const hashes = [createHash("sha256"), createHash("sha256")];
    const sizes = [0, 0],
      captured: Buffer[][] = [[], []],
      capturedSizes = [0, 0];
    let reason: string | undefined,
      closed = false,
      cleanupPending = false,
      finished = false;
    let exitCode: number | null = null,
      signal: NodeJS.Signals | null = null;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const processGroup = process.platform !== "win32";
    const child = spawn(
      checkpoint.runtime.executable,
      [...checkpoint.runtime.prefix, ...check.command.slice(1)],
      {
        cwd: root,
        shell: false,
        detached: processGroup,
        stdio: ["ignore", "pipe", "pipe"],
        env: checkpoint.environment.values,
      },
    );
    const kill = (terminationSignal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (processGroup) process.kill(-child.pid, terminationSignal);
        else child.kill(terminationSignal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH")
          reason ??= "verification_cleanup_failed";
      }
    };
    const finish = () => {
      if (finished || !closed || cleanupPending) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(escalation);
      options.signal?.removeEventListener("abort", abort);
      kill("SIGKILL");
      // Стандартные несекретные flags сохраняют полезную диагностику; пользовательские значения скрываются.
      const flags = new Set([
        "NODE_ENV",
        "CI",
        "LANG",
        "LC_ALL",
        "TZ",
        "NEXT_TELEMETRY_DISABLED",
        "REALIZE_AI_RUNTIME_ISOLATED",
        "REALIZE_BUILD_WITHOUT_DATABASE",
        "TURBO_TASKS_AVAILABLE_PARALLELISM",
      ]);
      const secretNames = new Set([
        ...Object.keys(check.environment ?? {}),
        ...(check.inheritEnvironment ?? []),
      ]);
      const secrets = [...secretNames]
        .filter((name) => !flags.has(name))
        .map((name) => checkpoint.environment.values[name] ?? "");
      const diagnostic = captured
        .map((chunks, index) => {
          let text = Buffer.concat(chunks).toString("utf8");
          if (sizes[index] > capturedSizes[index])
            text = text.slice(0, Math.max(0, text.lastIndexOf("\n")));
          return redactVerificationOutput(text, secrets).replaceAll(
            root,
            "[workspace]",
          );
        })
        .filter(Boolean)
        .join("\n");
      resolve({
        status:
          reason === "verification_cancelled"
            ? "cancelled"
            : reason || exitCode !== 0 || signal
              ? "failed"
              : "passed",
        ...(reason
          ? { reason }
          : exitCode !== 0 || signal
            ? { reason: "verification_command_failed" }
            : {}),
        exitCode,
        signal,
        timedOut: reason === "verification_timeout",
        stdoutBytes: sizes[0],
        stderrBytes: sizes[1],
        stdoutHash: hashes[0].digest("hex"),
        stderrHash: hashes[1].digest("hex"),
        diagnostic: diagnostic.slice(0, 8192),
        diagnosticTruncated:
          diagnostic.length > 8192 ||
          sizes.some((size, index) => size > capturedSizes[index]),
      });
    };
    const stop = (code: string) => {
      if (cleanupPending || finished) return;
      reason ??= code;
      cleanupPending = true;
      kill("SIGTERM");
      // Root npm может закрыться до игнорирующего SIGTERM потомка; cleanup ждёт полный grace.
      escalation = setTimeout(() => {
        kill("SIGKILL");
        cleanupPending = false;
        finish();
      }, 2000);
    };
    const abort = () => stop("verification_cancelled");
    const timer = setTimeout(
      () => stop("verification_timeout"),
      check.timeoutMs,
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const consume = (index: number, bytes: Buffer) => {
      sizes[index] += bytes.length;
      hashes[index].update(bytes);
      const take = Math.max(
        0,
        Math.min(bytes.length, 65536 - capturedSizes[index]),
      );
      if (take) {
        captured[index].push(Buffer.from(bytes.subarray(0, take)));
        capturedSizes[index] += take;
      }
      if (sizes[0] + sizes[1] > 8 * 1024 * 1024)
        stop("verification_output_limit");
    };
    child.stdout?.on("data", (bytes: Buffer) => consume(0, bytes));
    child.stderr?.on("data", (bytes: Buffer) => consume(1, bytes));
    child.once("error", () => {
      reason ??= "verification_process_unavailable";
    });
    child.once("close", (code, terminationSignal) => {
      exitCode = code;
      signal = terminationSignal;
      closed = true;
      finish();
    });
  });
}
