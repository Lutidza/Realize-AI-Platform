/**
 * @file scripts/migrations/command-runner.mjs
 * @version 2026-08-17
 * @description Runs bounded external commands without shell interpolation or secret leakage.
 */

import { spawn } from "node:child_process";

const maximumCapturedBytes = 4 * 1024 * 1024;

function appendBounded(current, chunk) {
  const next = `${current}${chunk.toString("utf8")}`;
  return next.length > maximumCapturedBytes
    ? next.slice(next.length - maximumCapturedBytes)
    : next;
}

function redact(value, secrets) {
  let redacted = value
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/giu, "postgres://[REDACTED]@")
    .replace(/(authorization:\s*bearer\s+)[^\s]+/giu, "$1[REDACTED]");

  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 8) {
      redacted = redacted.split(secret).join("[REDACTED]");
    }
  }

  return redacted;
}

/**
 * Executes a command with argv semantics, bounded output and a hard timeout.
 *
 * @param {string} executable
 * @param {string[]} args
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv, secrets?: string[], timeoutMs?: number }} options
 * @returns {Promise<{ stdout: string, stderr: string }>}
 * @throws {Error} When the command cannot start, times out or exits non-zero.
 */
export function runCommand(executable, args, options) {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const secrets = options.secrets ?? [];

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, timeoutMs);
    timeout.unref();

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          `Could not start ${executable}: ${redact(error.message, secrets)}`,
        ),
      );
    });

    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const safeStdout = redact(stdout, secrets);
      const safeStderr = redact(stderr, secrets);

      if (code === 0) {
        resolve({ stderr: safeStderr, stdout: safeStdout });
        return;
      }

      const reason = signal
        ? `terminated by ${signal}`
        : `exited with code ${code ?? "unknown"}`;
      const diagnostic = `${safeStdout}\n${safeStderr}`.trim().slice(-8_000);
      reject(
        new Error(
          `${executable} ${reason}${diagnostic ? `:\n${diagnostic}` : ""}`,
        ),
      );
    });
  });
}
