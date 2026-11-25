/**
 * @file .ai/tools/codex-request-diagnostics/src/codexExec.adapter.ts
 * @version 1.0.1
 * @date 2026-11-25
 * @description Выполняет bounded stock ephemeral exec и возвращает только process metadata.
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { assertSafeCodexLaunch } from "./assertSafeCodexLaunch.util.ts";
import type {
  CodexExecFailureCode,
  CodexExecOptions,
  CodexExecProcessIdentity,
  CodexExecResult,
} from "./codexExec.types.ts";

const DEADLINE_MS = 240_000;
const MAX_LINE_BYTES = 16 * 1024 * 1024;
const MAX_PROC_ENTRIES = 32_768;
const TERM_GRACE_MS = 1500;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function initialResult(): CodexExecResult {
  return {
    pid: null,
    exitCode: null,
    signal: null,
    exitObserved: false,
    timedOut: false,
    groupStopped: false,
    errorCode: null,
    eventCount: 0,
  };
}

/** Читает только числовую process identity; cmdline/environ и содержимое файлов процесса не читаются. */
function identity(pid: number): CodexExecProcessIdentity | null {
  try {
    const text = readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = text.lastIndexOf(")"),
      fields = text.slice(close + 2).split(" ");
    if (close < 0 || fields.length < 20) return null;
    const parent = Number(fields[1]),
      group = Number(fields[2]),
      startTicks = fields[19];
    if (
      ![parent, group].every(Number.isSafeInteger) ||
      !/^[0-9]+$/u.test(startTicks)
    )
      return null;
    return { pid, parent, group, startTicks, state: fields[0] };
  } catch {
    return null;
  }
}

function processTable(): Map<number, CodexExecProcessIdentity> | null {
  try {
    const names = readdirSync("/proc").filter((name) => /^[0-9]+$/u.test(name));
    if (names.length > MAX_PROC_ENTRIES) return null;
    const rows = new Map<number, CodexExecProcessIdentity>();
    for (const name of names) {
      const row = identity(Number(name));
      if (row) rows.set(row.pid, row);
    }
    return rows;
  } catch {
    return null;
  }
}

function safeEnvironment(
  overrides: CodexExecOptions["environment"],
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...overrides };
  for (const name of Object.keys(environment)) {
    if (
      /^(?:OTEL_|CODEX_(?:ROLLOUT_TRACE|TRACE|LOG_FILE|LOG_PATH|LOG_DIR))/u.test(
        name,
      ) ||
      /^(?:SSLKEYLOGFILE|SSLKEYLOG_FILE|SSLKEYLOG_PATH|TLS_KEY_LOG_FILE|NODE_DEBUG|NODE_DEBUG_NATIVE)$/u.test(
        name,
      )
    )
      delete environment[name];
  }
  environment.RUST_LOG = "off";
  environment.RUST_BACKTRACE = "0";
  return environment;
}

/** Не пишет raw streams/events; не-model items проходят только parsed callback в RAM. */
export async function runCodexExec(
  options: CodexExecOptions,
): Promise<CodexExecResult> {
  const result = initialResult();
  if (
    typeof options.cwd !== "string" ||
    !options.cwd ||
    options.cwd.includes("\0") ||
    typeof options.prompt !== "string" ||
    Buffer.byteLength(options.prompt) > MAX_LINE_BYTES ||
    typeof options.event !== "function" ||
    typeof options.started !== "function"
  ) {
    result.errorCode = "exec_input_invalid";
    result.groupStopped = true;
    return result;
  }
  const environment = safeEnvironment(options.environment);
  try {
    // Общий guard читает config paths родителя: подмена home в child запрещена.
    if (
      ["CODEX_HOME", "HOME", "USERPROFILE", "XDG_CONFIG_HOME"].some(
        (name) => environment[name] !== process.env[name],
      ) ||
      Boolean(environment.NODE_OPTIONS?.trim())
    )
      throw new Error("exec_unsafe_logging_configuration");
    assertSafeCodexLaunch(options.cwd);
  } catch {
    result.errorCode = "exec_unsafe_logging_configuration";
    result.groupStopped = true;
    return result;
  }
  if (process.platform !== "linux" || !processTable()) {
    result.errorCode = "exec_process_tracking_unavailable";
    return result;
  }
  const args = [
    "--no-daemon",
    "-a",
    "never",
    "exec",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--json",
    // У ephemeral диагностики нет места для истории и файлов SQLite под Linux.
    "-c",
    'history.persistence="none"',
    "-c",
    'sqlite_home="/dev/null"',
    "-c",
    "features.apps=false",
    "-c",
    "features.plugins=false",
    "-c",
    'otel.exporter="none"',
    "-c",
    'otel.trace_exporter="none"',
    "-c",
    "otel.log_user_prompt=false",
    // Guard отвергает заданную shell policy; default secret filter остаётся включён.
    "-c",
    'shell_environment_policy.exclude=["HTTPS_PROXY","HTTP_PROXY","ALL_PROXY","NO_PROXY","https_proxy","http_proxy","all_proxy","no_proxy","CODEX_CA_CERTIFICATE"]',
  ];
  for (const name of [
    "recommerce-playwright",
    "recommerce-tailwind",
    "recommerce-next-devtools",
    "realize-internal",
  ])
    args.push("-c", `mcp_servers.${name}.enabled=false`);
  args.push("-");
  let child;
  try {
    child = spawn("codex", args, {
      cwd: options.cwd,
      env: environment,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    result.errorCode = "exec_spawn_failed";
    result.groupStopped = true;
    return result;
  }
  const owned = new Map<number, CodexExecProcessIdentity>();
  let leader: CodexExecProcessIdentity | null = null;
  let trackingComplete = true,
    closed = false;
  let lineChunks: Buffer[] = [],
    lineBytes = 0,
    stderrBytes = 0;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  let resolveExit!: () => void, resolveClose!: () => void;
  const exited = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });
  const ended = new Promise<void>((resolve) => {
    resolveClose = resolve;
  });

  const groupAnchored = (rows: Map<number, CodexExecProcessIdentity>) =>
    result.pid !== null &&
    [...owned.values()].some((old) => {
      const current = rows.get(old.pid);
      return (
        current?.startTicks === old.startTicks && current.group === result.pid
      );
    });

  const scan = () => {
    const rows = processTable();
    if (!rows) {
      trackingComplete = false;
      return null;
    }
    const originalLeader = leader;
    if (originalLeader) {
      // Числовой PGID без прежней живой identity не доказывает ownership после reuse.
      if (groupAnchored(rows)) {
        for (const row of rows.values()) {
          if (
            row.group === originalLeader.pid &&
            BigInt(row.startTicks) >= BigInt(originalLeader.startTicks)
          )
            owned.set(row.pid, row);
        }
      } else if (
        [...rows.values()].some((row) => row.group === originalLeader.pid)
      ) {
        trackingComplete = false;
      }
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows.values()) {
          const parent = owned.get(row.parent),
            currentParent = rows.get(row.parent);
          if (
            parent &&
            currentParent?.startTicks === parent.startTicks &&
            !owned.has(row.pid)
          ) {
            owned.set(row.pid, row);
            changed = true;
          }
        }
      }
    }
    return rows;
  };

  const signalOwned = (signal: NodeJS.Signals) => {
    const rows = scan();
    if (rows && groupAnchored(rows) && result.pid !== null) {
      try {
        process.kill(-result.pid, signal);
      } catch (error) {
        if (!(record(error) && error.code === "ESRCH"))
          trackingComplete = false;
      }
    }
    for (const old of owned.values()) {
      const current = rows?.get(old.pid);
      if (
        current?.startTicks !== old.startTicks ||
        current.group === result.pid
      )
        continue;
      try {
        process.kill(current.pid, signal);
      } catch (error) {
        if (!(record(error) && error.code === "ESRCH"))
          trackingComplete = false;
      }
    }
  };

  const fail = (code: CodexExecFailureCode) => {
    result.errorCode ??= code;
    lineChunks = [];
    lineBytes = 0;
    signalOwned("SIGTERM");
    escalation ??= setTimeout(() => signalOwned("SIGKILL"), TERM_GRACE_MS);
  };

  const parseLine = () => {
    if (!lineBytes || result.errorCode) {
      lineChunks = [];
      lineBytes = 0;
      return;
    }
    const raw = Buffer.concat(lineChunks, lineBytes);
    lineChunks = [];
    lineBytes = 0;
    try {
      const event: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw),
      );
      if (!record(event) || typeof event.type !== "string" || !event.type) {
        fail("exec_output_invalid");
        return;
      }
      const item = record(event.item) ? event.item : null;
      if (
        /reasoning/iu.test(event.type) ||
        (typeof item?.type === "string" && /reasoning/iu.test(item.type)) ||
        event.channel === "analysis" ||
        event.phase === "analysis" ||
        item?.channel === "analysis" ||
        item?.phase === "analysis"
      )
        return;
      if (result.eventCount >= 100_000) {
        fail("exec_output_limit");
        return;
      }
      try {
        options.event(event.type, event);
        result.eventCount++;
      } catch {
        fail("exec_callback_failed");
      }
    } catch {
      fail("exec_output_invalid");
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    if (result.errorCode) return;
    let offset = 0;
    while (offset < chunk.length && !result.errorCode) {
      const boundary = chunk.indexOf(10, offset);
      const end = boundary === -1 ? chunk.length : boundary;
      const part = chunk.subarray(offset, end);
      if (lineBytes + part.length > MAX_LINE_BYTES) {
        fail("exec_output_limit");
        return;
      }
      if (part.length) {
        lineChunks.push(Buffer.from(part));
        lineBytes += part.length;
      }
      if (boundary === -1) break;
      parseLine();
      offset = boundary + 1;
    }
  });
  child.stdout.on("end", parseLine);
  child.stdout.on("error", () => fail("exec_stream_failed"));
  child.stderr.on("data", (chunk: Buffer) => {
    stderrBytes += chunk.length;
    if (stderrBytes > MAX_LINE_BYTES && !result.errorCode)
      fail("exec_output_limit");
  });
  child.stderr.on("error", () => fail("exec_stream_failed"));
  child.stdin.on("error", () => fail("exec_stdin_failed"));
  child.once("spawn", () => {
    result.pid = child.pid ?? null;
    leader = result.pid === null ? null : identity(result.pid);
    if (!leader) trackingComplete = false;
    else owned.set(leader.pid, leader);
    try {
      if (result.pid !== null) options.started(result.pid);
    } catch {
      fail("exec_callback_failed");
    }
    child.stdin.end(options.prompt);
  });
  child.once("error", () => {
    result.errorCode ??=
      result.pid === null ? "exec_spawn_failed" : "exec_stream_failed";
    if (result.pid === null) resolveExit();
    else fail("exec_stream_failed");
  });
  child.once("exit", (code, signal) => {
    result.exitCode = code;
    result.signal = signal;
    result.exitObserved = true;
    resolveExit();
  });
  child.once("close", () => {
    closed = true;
    resolveClose();
  });
  const monitor = setInterval(scan, 200);
  const deadline = setTimeout(() => {
    result.timedOut = true;
    fail("exec_timeout");
  }, DEADLINE_MS);
  try {
    await exited;
    // Descendants могут держать stdio открытым после exit родителя: сначала останавливаем их.
    signalOwned("SIGTERM");
    const until = performance.now() + 5000;
    let empty = false;
    while (performance.now() < until) {
      const rows = scan();
      const living =
        rows &&
        [...rows.values()].some(
          (row) =>
            row.group === result.pid ||
            owned.get(row.pid)?.startTicks === row.startTicks,
        );
      if (rows && !living) {
        empty = true;
        break;
      }
      signalOwned("SIGKILL");
      await delay(100);
    }
    result.groupStopped =
      result.pid === null || (empty && trackingComplete && leader !== null);
    if (!closed) {
      await Promise.race([ended, delay(1500)]);
      if (!closed) {
        result.groupStopped = false;
        result.errorCode ??= "exec_cleanup_failed";
        child.stdout.destroy();
        child.stderr.destroy();
        child.stdin.destroy();
        await ended;
      }
    }
    if (!result.groupStopped) result.errorCode ??= "exec_cleanup_failed";
    if (
      result.exitObserved &&
      (result.exitCode !== 0 || result.signal !== null)
    )
      result.errorCode ??= "exec_process_failed";
  } finally {
    clearTimeout(deadline);
    clearInterval(monitor);
    if (escalation) clearTimeout(escalation);
    lineChunks = [];
    lineBytes = 0;
  }
  return result;
}
