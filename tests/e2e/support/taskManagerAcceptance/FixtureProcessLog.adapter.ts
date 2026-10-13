/**
 * @file tests/e2e/support/taskManagerAcceptance/FixtureProcessLog.adapter.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Журналирует output процесса fixture с редактированием секретов и ограниченным буфером строк.
 * @see documentation/specifications/task-management-execution.md
 */
import { createWriteStream } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import type {
  FixtureProcessLog,
  FixtureProcessOptions,
} from "./FixtureProcess.types";

const MAX_LINE_LENGTH = 65_536;

function secretValues(env: NodeJS.ProcessEnv): string[] {
  const values = new Set<string>();
  for (const [key, value] of Object.entries(env)) {
    if (
      !value ||
      !/(?:SECRET|TOKEN|PASSWORD|ENCRYPTION|PRIVATE_KEY|API_KEY|DATABASE_(?:URI|URL))/i.test(
        key,
      )
    )
      continue;
    values.add(value);
    // PEM и другие многострочные секреты не должны вытекать отдельными строками.
    for (const part of value.split(/\r?\n/)) if (part) values.add(part);
    if (/(?:DATABASE|DB).*?(?:URI|URL)/i.test(key)) {
      try {
        const password = new URL(value).password;
        if (password) {
          values.add(password);
          values.add(decodeURIComponent(password));
        }
      } catch {
        // Некорректный URI всё равно редактируется целиком.
      }
    }
  }
  return [...values].sort((left, right) => right.length - left.length);
}

/** Запись завершается только после close собственного log FD или callbacks вывода в stdout. */
export function createFixtureProcessLog(
  options: FixtureProcessOptions,
): FixtureProcessLog {
  const secrets = secretValues(options.env);
  const output = options.logFile
    ? createWriteStream(options.logFile, { flags: "a", mode: 0o600 })
    : process.stdout;
  let failed = false;
  let finished = false;
  let closed = false;
  let pendingWrites = 0;
  const handleError = () => {
    failed = true;
    if (options.logFile) output.destroy();
  };
  output.once("error", handleError);
  if (options.logFile) {
    output.once("close", () => {
      closed = true;
    });
  }
  const channels = {
    stdout: { decoder: new StringDecoder("utf8"), line: "", dropping: false },
    stderr: { decoder: new StringDecoder("utf8"), line: "", dropping: false },
  };
  const emit = (value: string) => {
    if (failed || !value) return;
    let redacted = value;
    for (const secret of secrets)
      redacted = redacted.split(secret).join("[redacted]");
    pendingWrites++;
    output.write(redacted, (error) => {
      pendingWrites--;
      if (error) failed = true;
      if (finished && !options.logFile && pendingWrites === 0) {
        closed = true;
        if (!error) output.removeListener("error", handleError);
      }
    });
  };
  const append = (chunk: string, channel: "stdout" | "stderr") => {
    const state = channels[channel];
    // Слишком длинная строка отбрасывается целиком: её частичный flush мог бы раскрыть split secret.
    for (const part of chunk.split(/(?<=\n)/)) {
      if (!state.dropping) {
        state.line += part;
        if (state.line.length > MAX_LINE_LENGTH) {
          state.line = "";
          state.dropping = true;
          emit("[fixture log line omitted: too long]\n");
        }
      }
      if (part.endsWith("\n")) {
        if (!state.dropping) emit(state.line);
        state.line = "";
        state.dropping = false;
      }
    }
  };
  return {
    write(chunk, channel) {
      if (!finished) append(channels[channel].decoder.write(chunk), channel);
    },
    finish() {
      if (finished) return;
      for (const channel of ["stdout", "stderr"] as const) {
        append(channels[channel].decoder.end(), channel);
        if (!channels[channel].dropping) emit(channels[channel].line);
        channels[channel].line = "";
      }
      finished = true;
      if (options.logFile) output.end();
      else if (pendingWrites === 0) {
        closed = true;
        output.removeListener("error", handleError);
      }
    },
    isClosed: () => closed,
    hasFailed: () => failed,
  };
}
