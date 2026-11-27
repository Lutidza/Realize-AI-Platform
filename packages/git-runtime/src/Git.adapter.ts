/**
 * @file packages/git-runtime/src/Git.adapter.ts
 * @version 1.3.2
 * @date 2026-11-27
 * @description Ограниченный запуск Git без shell; унаследованные GIT_* не меняют выбранную рабочую копию.
 */

import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { GitFailure } from "./GitFailure.error.ts";
import { classifyGitFailure } from "./classifyGitFailure.util.ts";
import type {
  GitExecutionProfile,
  GitOptions,
  GitRunOptions,
} from "./Git.types.ts";
import type { GitLock } from "./GitLock.types.ts";
import { assertGitLockHeld } from "./acquireGitLock.adapter.ts";
import {
  assertMachineReadArguments,
  gitCommandOffset,
  requiresGitLock,
} from "./GitExecutionProfile.policy.ts";
import { assertGitNetworkConfiguration } from "./assertGitNetworkConfiguration.adapter.ts";
import { GIT_NETWORK_CONFIG } from "./gitNetworkConfig.constants.ts";
import { PolicyError } from "./Policy.error.ts";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_STDERR_DIAGNOSTIC_BYTES = 64 * 1024;
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

/** Исполняет только программно составленные аргументы, сохраняя configured hooks/signing. */
export class Git {
  root: string;
  private lock?: GitLock;
  private readonly profile: GitExecutionProfile;
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(root: string, options: GitOptions = {}) {
    this.root = resolve(root);
    this.profile = options.profile ?? "developer";
    this.command = options.command ?? "git";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    if (
      !["developer", "service", "machine-read"].includes(this.profile) ||
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

  /** Не захватывает lock повторно; полномочие и принадлежность проверяются перед записью. */
  attachLock(lease: GitLock): void {
    assertGitLockHeld(lease);
    this.lock = lease;
  }

  /** Заимствованный lease освобождает вызывающий owner. */
  detachLock(): void {
    this.lock = undefined;
  }

  /** Возвращает полный UTF-8 stdout либо ошибку, не выдавая stderr или содержимое аргументов. */
  async run(
    args: readonly string[],
    options: GitRunOptions = {},
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
    args: readonly string[],
    options: GitRunOptions = {},
  ): Promise<Buffer> {
    if (options.signal?.aborted)
      throw new GitFailure(
        "git_timeout",
        "Чтение Git отменено.",
        null,
        "timeout",
      );
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
    const offset = gitCommandOffset(args);
    const machineRead =
      this.profile === "machine-read" || options.machineRead === true;
    if (machineRead) assertMachineReadArguments(args);
    const mutation = requiresGitLock(args);
    if (machineRead && mutation)
      throw new GitFailure(
        "git_arguments_invalid",
        "Машинное чтение не разрешает изменение Git.",
      );
    if (this.lock) assertGitLockHeld(this.lock);
    if (mutation) {
      if (!this.lock)
        throw new PolicyError(
          "git_lock_required",
          "Изменение Git требует общей блокировки репозитория.",
        );
      const probe = new Git(this.root, {
        profile: "machine-read",
        command: this.command,
        timeoutMs: this.timeoutMs,
        maxOutputBytes: 16384,
      });
      const common = await realpath(
        (
          await probe.run(
            ["rev-parse", "--path-format=absolute", "--git-common-dir"],
            { signal: options.signal },
          )
        ).trimEnd(),
      );
      assertGitLockHeld(this.lock);
      if (common !== this.lock.commonDirectory)
        throw new PolicyError(
          "git_lock_repository_mismatch",
          "Git owner не совпадает с блокировкой операции.",
        );
    }
    if (
      ["fetch", "push", "ls-remote", "clone"].includes(args[offset]) &&
      !options.network
    )
      throw new GitFailure(
        "git_network_required",
        "Сетевая операция Git требует явного серверного подключения.",
      );
    if (
      this.profile === "service" &&
      args
        .slice(offset + 1)
        .some(
          (part) =>
            part === "-S" ||
            part.startsWith("--gpg-sign") ||
            /^-S.+/u.test(part),
        )
    )
      throw new GitFailure(
        "git_arguments_invalid",
        "Служебный профиль не использует пользовательскую подпись.",
      );
    const input = options.input ?? "";
    if (
      (typeof input !== "string" && !Buffer.isBuffer(input)) ||
      Buffer.byteLength(input, "utf8") > MAX_INPUT_BYTES
    ) {
      throw new GitFailure(
        "git_input_limit",
        "Вход Git превышает допустимый размер.",
      );
    }
    const env: Record<string, string | undefined> = {};
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
    if (machineRead) {
      if (options.network) {
        throw new GitFailure(
          "git_arguments_invalid",
          "Операция не разрешена машинному чтению.",
        );
      }
      env.GIT_CONFIG_GLOBAL = "/dev/null";
      env.GIT_CONFIG_NOSYSTEM = "1";
      env.GIT_NO_REPLACE_OBJECTS = "1";
      env.GIT_NO_LAZY_FETCH = "1";
      env.GIT_ALLOW_PROTOCOL = "";
      env.GIT_PAGER = "cat";
      env.LC_ALL = "C";
      delete env.SSH_AUTH_SOCK;
    }
    if (this.profile === "service") {
      env.GIT_CONFIG_GLOBAL = "/dev/null";
      env.GIT_CONFIG_NOSYSTEM = "1";
      env.GIT_NO_REPLACE_OBJECTS = "1";
      env.GIT_NO_LAZY_FETCH = "1";
      env.GIT_ALLOW_PROTOCOL = "";
      delete env.SSH_AUTH_SOCK;
      delete env.GPG_TTY;
      delete env.GNUPGHOME;
    }
    if (options.network !== undefined) {
      const network = options.network;
      const allowed =
        network?.transport === "https"
          ? ["transport", "askpassPath", "token"]
          : ["transport", "sshPath"];
      const executable =
        network?.transport === "https" ? network.askpassPath : network?.sshPath;
      if (
        !network ||
        !["https", "ssh"].includes(network.transport) ||
        Object.keys(network).some((key) => !allowed.includes(key)) ||
        typeof executable !== "string" ||
        !isAbsolute(executable) ||
        !/^\/[A-Za-z0-9_./-]+$/.test(executable) ||
        (network.transport === "https" &&
          (typeof network.token !== "string" ||
            !network.token ||
            Buffer.byteLength(network.token) > 32768 ||
            /[\0\r\n]/.test(network.token)))
      ) {
        throw new GitFailure(
          "git_environment_invalid",
          "Недопустимое сетевое окружение Git.",
        );
      }
      await assertGitNetworkConfiguration(
        this,
        network.transport,
        args.slice(0, offset),
        options.signal,
      );
      env.GIT_ALLOW_PROTOCOL = network.transport;
      env.LC_ALL = "C";
      delete env.SSH_AUTH_SOCK;
      if (network.transport === "https") {
        env.GIT_ASKPASS = network.askpassPath;
        env.REALIZE_GIT_HTTP_TOKEN = network.token;
      } else {
        env.GIT_SSH = network.sshPath;
        env.GIT_SSH_VARIANT = "ssh";
        env.SSH_ASKPASS_REQUIRE = "never";
      }
    }

    if (this.lock) assertGitLockHeld(this.lock);
    return await new Promise<Buffer>((resolvePromise, reject) => {
      const child = spawn(
        this.command,
        [
          "--literal-pathspecs",
          "-c",
          "core.fsmonitor=false",
          ...(machineRead
            ? [
                "-c",
                "core.hooksPath=/dev/null",
                "-c",
                "diff.external=",
                "-c",
                "core.attributesFile=/dev/null",
                "-c",
                "submodule.recurse=false",
              ]
            : []),
          ...args.slice(0, offset),
          ...(options.network ? GIT_NETWORK_CONFIG : []),
          ...(this.profile === "service"
            ? [
                "-c",
                "core.hooksPath=/dev/null",
                "-c",
                "commit.gpgSign=false",
                "-c",
                "tag.gpgSign=false",
              ]
            : []),
          ...args.slice(offset),
        ],
        {
          cwd: this.root,
          env: { ...env, NODE_ENV: process.env.NODE_ENV },
          shell: false,
          detached: true,
          stdio: [
            "pipe",
            "pipe",
            "pipe",
            ...(this.lock === undefined ? [] : [this.lock.descriptor]),
          ],
        },
      );
      const chunks: Buffer[] = [];
      // Копируем только префикс: subarray входного chunk удержал бы весь его backing buffer.
      const stderrDiagnostic = Buffer.alloc(
        Math.min(MAX_STDERR_DIAGNOSTIC_BYTES, this.maxOutputBytes),
      );
      let stderrDiagnosticBytes = 0;
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let failure: GitFailure | null = null;
      let settled = false;

      const finish = (error: GitFailure | null, value?: Buffer): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        stderrDiagnostic.fill(0);
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
        stop(
          new GitFailure(
            "git_timeout",
            "Истекло время выполнения Git.",
            null,
            "timeout",
          ),
        );
      }, this.timeoutMs);
      const abort = () =>
        stop(
          new GitFailure(
            "git_timeout",
            "Чтение Git отменено.",
            null,
            "timeout",
          ),
        );
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();

      child.stdout!.on("data", (chunk: Buffer) => {
        if (failure) return;
        stdoutBytes += chunk.length;
        if (stdoutBytes > this.maxOutputBytes) {
          stop(
            new GitFailure(
              "git_output_limit",
              "Вывод Git превышает допустимый размер.",
              null,
              "output_limit",
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
              null,
              "output_limit",
            ),
          );
        }
        if (!failure && stderrDiagnosticBytes < stderrDiagnostic.length) {
          stderrDiagnosticBytes += chunk.copy(
            stderrDiagnostic,
            stderrDiagnosticBytes,
            0,
            Math.min(
              chunk.length,
              stderrDiagnostic.length - stderrDiagnosticBytes,
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
        if (
          code === null ||
          !(options.acceptedExitCodes ?? [0]).includes(code)
        ) {
          return finish(
            new GitFailure(
              "git_command_failed",
              "Команда Git завершилась ошибкой.",
              code,
              classifyGitFailure(
                stderrDiagnostic.toString("utf8", 0, stderrDiagnosticBytes),
              ),
            ),
          );
        }
        finish(null, Buffer.concat(chunks, stdoutBytes));
      });
      child.stdin!.end(input);
    });
  }
}
