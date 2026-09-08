/** Ограниченный запуск Git без shell; унаследованные GIT_* не меняют выбранную рабочую копию. */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_BYTES = 1024 * 1024;
const SYSTEM_ENVIRONMENT = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_RUNTIME_DIR",
  "SSH_AUTH_SOCK",
  "GPG_TTY",
  "GNUPGHOME",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "TERM",
  "NODE_ENV",
] as const;
const IDENTITY_ENVIRONMENT = new Set([
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
]);

/** Безопасная причина сбоя; exitCode нужен для ожидаемого отсутствия Git-ссылки. */
export class GitFailure extends Error {
  code: string;
  exitCode: number | null;

  constructor(code: string, message: string, exitCode: number | null = null) {
    super(message);
    this.name = "GitFailure";
    this.code = code;
    this.exitCode = exitCode;
  }
}

/** Исполняет только программно составленные аргументы, сохраняя configured hooks/signing. */
export class Git {
  root: string;
  /** Доверенный descriptor блокировки сохраняет её, пока Git жив после сбоя родителя. */
  lockDescriptor?: number;
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(
    root: string,
    options: {
      command?: string;
      timeoutMs?: number;
      maxOutputBytes?: number;
    } = {},
  ) {
    this.root = resolve(root);
    this.command = options.command ?? "git";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    if (
      !this.command ||
      this.command.includes("\0") ||
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > 300_000 ||
      !Number.isSafeInteger(this.maxOutputBytes) ||
      this.maxOutputBytes < 1 ||
      this.maxOutputBytes > 128 * 1024 * 1024
    ) {
      throw new GitFailure(
        "git_configuration_invalid",
        "Недопустимые параметры исполнителя Git.",
      );
    }
  }

  /** Возвращает полный UTF-8 stdout либо ошибку, не выдавая stderr или содержимое аргументов. */
  async run(
    args: string[],
    options: { input?: string; env?: Record<string, string> } = {},
  ): Promise<string> {
    const output = await this.runBytes(args, options);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(output);
    } catch {
      throw new GitFailure(
        "git_output_invalid",
        "Вывод Git не является допустимым UTF-8.",
      );
    }
  }

  /** Возвращает точные байты stdout, включая бинарные blobs, с теми же пределами исполнения. */
  async runBytes(
    args: string[],
    options: { input?: string; env?: Record<string, string> } = {},
  ): Promise<Buffer> {
    if (process.platform !== "linux") {
      throw new GitFailure(
        "unsupported_platform",
        "Исполнитель Git требует Linux.",
      );
    }
    if (
      !args.length ||
      args.some((arg) => typeof arg !== "string" || arg.includes("\0"))
    ) {
      throw new GitFailure(
        "git_arguments_invalid",
        "Недопустимые аргументы Git.",
      );
    }
    if (
      this.lockDescriptor !== undefined &&
      (!Number.isSafeInteger(this.lockDescriptor) || this.lockDescriptor < 3)
    ) {
      throw new GitFailure(
        "git_configuration_invalid",
        "Недопустимый descriptor блокировки Git.",
      );
    }
    const input = options.input ?? "";
    if (
      typeof input !== "string" ||
      Buffer.byteLength(input, "utf8") > MAX_INPUT_BYTES
    ) {
      throw new GitFailure(
        "git_input_limit",
        "Вход Git превышает допустимый размер.",
      );
    }
    const env: NodeJS.ProcessEnv = {};
    for (const key of SYSTEM_ENVIRONMENT) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    for (const [key, value] of Object.entries(options.env ?? {})) {
      if (
        !IDENTITY_ENVIRONMENT.has(key) ||
        typeof value !== "string" ||
        value.includes("\0")
      ) {
        throw new GitFailure(
          "git_environment_invalid",
          "Недопустимое окружение Git.",
        );
      }
      env[key] = value;
    }
    env.GIT_OPTIONAL_LOCKS = "0";
    env.GIT_TERMINAL_PROMPT = "0";

    return await new Promise<Buffer>((resolvePromise, reject) => {
      const child = spawn(
        this.command,
        ["--literal-pathspecs", "-c", "core.fsmonitor=false", ...args],
        {
          cwd: this.root,
          env,
          shell: false,
          detached: true,
          stdio: [
            "pipe",
            "pipe",
            "pipe",
            ...(this.lockDescriptor === undefined ? [] : [this.lockDescriptor]),
          ],
        },
      );
      const chunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let failure: GitFailure | null = null;
      let settled = false;

      const finish = (error: GitFailure | null, value?: Buffer): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolvePromise(value ?? Buffer.alloc(0));
      };
      const stop = (error: GitFailure): void => {
        if (failure || settled) return;
        failure = error;
        if (child.pid !== undefined) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        }
      };
      const timer = setTimeout(() => {
        stop(new GitFailure("git_timeout", "Истекло время выполнения Git."));
      }, this.timeoutMs);

      child.stdout!.on("data", (chunk: Buffer) => {
        if (failure) return;
        stdoutBytes += chunk.length;
        if (stdoutBytes > this.maxOutputBytes) {
          stop(
            new GitFailure(
              "git_output_limit",
              "Вывод Git превышает допустимый размер.",
            ),
          );
        } else {
          chunks.push(chunk);
        }
      });
      child.stderr!.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stderrBytes > this.maxOutputBytes) {
          stop(
            new GitFailure(
              "git_output_limit",
              "Вывод Git превышает допустимый размер.",
            ),
          );
        }
      });
      child.stdin!.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "EPIPE") {
          stop(
            new GitFailure("git_input_failed", "Не удалось передать вход Git."),
          );
        }
      });
      child.on("error", () => {
        finish(
          new GitFailure(
            "git_start_failed",
            "Не удалось запустить исполнитель Git.",
          ),
        );
      });
      child.on("close", (code) => {
        if (failure) return finish(failure);
        if (code !== 0) {
          return finish(
            new GitFailure(
              "git_command_failed",
              "Команда Git завершилась ошибкой.",
              code,
            ),
          );
        }
        finish(null, Buffer.concat(chunks, stdoutBytes));
      });
      child.stdin!.end(input);
    });
  }
}
