/**
 * @file packages/codex-adapter/src/JsonLineRpcClient.adapter.ts
 * @version 2.4.0
 * @date 2026-10-22
 * @description Ограниченный JSONL RPC и завершение изолированного процесса Codex App Server.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, isAbsolute } from "node:path";

import { AsyncQueue } from "./AsyncQueue";
import { JsonLineRpcError } from "./JsonLineRpc.error";
import type {
  JsonLineRPCClientOptions,
  JsonLineRpcErrorCode,
  PendingRpcRequest,
} from "./JsonLineRpcClient.types";
import type { JSONRPCID, RPCMessage } from "./protocol";

export { JsonLineRpcError } from "./JsonLineRpc.error";
export type { JsonLineRPCClientOptions } from "./JsonLineRpcClient.types";

const MAX_LINE_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const FORCE_KILL_DELAY_MS = 1_000;
const DEFAULT_ARGUMENTS = [
  "app-server",
  "--stdio",
  "--strict-config",
  "-c",
  "mcp_servers={}",
  "-c",
  "notify=[]",
  "-c",
  'web_search="disabled"',
  "-c",
  'shell_environment_policy.inherit="none"',
];

const defaultArguments = (options: JsonLineRPCClientOptions): string[] => [
  ...DEFAULT_ARGUMENTS,
  ...(options.ignoreProjectInstructions
    ? [
        "-c",
        "project_doc_max_bytes=0",
        "-c",
        "project_doc_fallback_filenames=[]",
        "-c",
        `projects={${JSON.stringify(options.workingDirectory)}={trust_level="untrusted"}}`,
      ]
    : []),
  ...(!options.repositoryMcpURL
    ? []
    : [
        "-c",
        `mcp_servers.realize_repository.url=${JSON.stringify(options.repositoryMcpURL)}`,
        "-c",
        'mcp_servers.realize_repository.bearer_token_env_var="REALIZE_CODEX_REPO_BRIDGE_AUTH"',
        "-c",
        'mcp_servers.realize_repository.enabled_tools=["repo_search","repo_read_file","repo_list_files","repo_git_head"]',
        "-c",
        "mcp_servers.realize_repository.startup_timeout_sec=10",
        "-c",
        "mcp_servers.realize_repository.tool_timeout_sec=20",
      ]),
  ...(!options.search
    ? []
    : options.search.enabled && options.search.mode === "subagent"
      ? [
          "-c",
          "agents.enabled=true",
          "-c",
          "agents.max_concurrent_threads_per_session=1",
          "-c",
          `agents.default_subagent_model=${JSON.stringify(options.search.model)}`,
        ]
      : ["-c", "agents.enabled=false"]),
  ...(process.platform === "linux"
    ? [
        "-c",
        // Без tool PATH Codex выбирает bundled bwrap без системного AppArmor-профиля.
        // Разрешаем только текущий Node и системные инструменты, не окружение хоста.
        `shell_environment_policy.set.PATH=${JSON.stringify(
          [...new Set([dirname(process.execPath), "/usr/bin", "/bin"])].join(
            ":",
          ),
        )}`,
      ]
    : []),
];

/** Обслуживает один процесс; повторный start после завершения не поддерживается. */
export class JsonLineRPCClient {
  private readonly options: JsonLineRPCClientOptions;
  private readonly notifications = new AsyncQueue<RPCMessage>();
  private readonly pending = new Map<JSONRPCID, PendingRpcRequest>();
  private readonly responses = new Set<Promise<void>>();
  private readonly completion: Promise<void>;
  private complete!: () => void;
  private child?: ChildProcessWithoutNullStreams;
  private failure?: JsonLineRpcError;
  private buffer: Buffer = Buffer.alloc(0);
  private nextID = 1;
  private stdoutBytes = 0;
  private stderrBytes = 0;
  private processClosed = false;
  private finished = false;
  private forceKill?: NodeJS.Timeout;
  private securityViolation = false;

  constructor(options: JsonLineRPCClientOptions) {
    this.options = options;
    this.completion = new Promise((resolve) => {
      this.complete = resolve;
    });
    if (
      !options.environment ||
      typeof options.environment.CODEX_HOME !== "string" ||
      !isAbsolute(options.environment.CODEX_HOME) ||
      options.environment.CODEX_HOME.includes("\0") ||
      !options.workingDirectory ||
      (options.webSearch !== undefined &&
        options.webSearch !== "disabled" &&
        options.webSearch !== "live") ||
      options.workingDirectory.includes("\0") ||
      (options.repositoryMcpURL !== undefined &&
        (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/mcp$/.test(
          options.repositoryMcpURL,
        ) ||
          !/^[A-Za-z0-9_-]{43}$/.test(
            options.environment.REALIZE_CODEX_REPO_BRIDGE_AUTH ?? "",
          ))) ||
      (options.codexBinary !== undefined &&
        (!options.codexBinary || options.codexBinary.includes("\0"))) ||
      options.args?.some(
        (argument) => typeof argument !== "string" || argument.includes("\0"),
      )
    ) {
      throw new JsonLineRpcError("codex_configuration_invalid");
    }
  }

  /** Запускает процесс без shell только с явным окружением профиля интеграции. */
  start(): void {
    if (this.failure) throw this.failure;
    if (this.child) throw new JsonLineRpcError("codex_already_started");
    if (this.options.signal?.aborted) {
      this.stop("codex_aborted");
      return;
    }
    try {
      this.child = spawn(
        this.options.codexBinary ?? "codex",
        [
          ...(this.options.args ??
            defaultArguments(this.options).map((argument) =>
              argument === 'web_search="disabled"'
                ? `web_search="${this.options.webSearch ?? "disabled"}"`
                : argument,
            )),
        ],
        {
          cwd: this.options.workingDirectory,
          env: this.options.environment,
          shell: false,
          detached: process.platform !== "win32",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
    } catch {
      this.stop("codex_spawn_failed");
      return;
    }
    this.child.stdout.on("data", this.handleStdout);
    this.child.stderr.on("data", this.handleStderr);
    this.child.stdin.on("error", this.handleStreamError);
    this.child.stdout.on("error", this.handleStreamError);
    this.child.stderr.on("error", this.handleStreamError);
    this.child.on("error", this.handleProcessError);
    this.child.on("exit", this.handleExit);
    this.child.on("close", this.handleClose);
    this.options.signal?.addEventListener("abort", this.handleAbort, {
      once: true,
    });
  }

  /** Закрывает pending и stdin, затем ожидает завершение группы процесса; идемпотентен. */
  async close(): Promise<void> {
    this.stop("codex_closed");
    await this.completion;
  }

  /** Очередь уведомлений для одного потребителя, сохраняющая порядок доставки. */
  async *getNotifications(): AsyncIterable<RPCMessage> {
    for await (const message of this.notifications) {
      // Ранний turn/completed не скрывает отказ незавершённого server request из того же chunk.
      if (message.method === "turn/completed") {
        while (this.responses.size) await Promise.all(this.responses);
      }
      if (this.securityViolation) {
        yield { method: "realize/securityViolation" };
        return;
      }
      yield message;
    }
  }

  /** Отправляет уведомление без ответа; ошибки сериализации и транспорта безопасны. */
  notify(method: string, params?: Record<string, unknown>): void {
    this.write({ method, ...(params === undefined ? {} : { params }) });
  }

  /** Сопоставляет ответ по id; серверные ошибки никогда не передают raw message. */
  async request<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (this.failure) throw this.failure;
    const id = this.nextID++;
    return await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new JsonLineRpcError("codex_request_timeout"));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      try {
        this.write({ id, method, ...(params === undefined ? {} : { params }) });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  private readonly handleAbort = (): void => this.stop("codex_aborted");
  private readonly handleStreamError = (): void =>
    this.stop("codex_transport_failed");
  private readonly handleProcessError = (): void =>
    this.stop("codex_spawn_failed");
  private readonly handleExit = (): void => this.stop("codex_process_exited");

  private readonly handleClose = (): void => {
    this.processClosed = true;
    this.stop("codex_process_exited");
    if (!this.forceKill || !this.groupExists()) this.finish();
  };

  private readonly handleStderr = (chunk: Buffer): void => {
    this.stderrBytes += chunk.length;
    if (this.stderrBytes > MAX_OUTPUT_BYTES) this.stop("codex_output_limit");
  };

  private readonly handleStdout = (chunk: Buffer): void => {
    if (this.failure) return;
    this.stdoutBytes += chunk.length;
    if (this.stdoutBytes > MAX_OUTPUT_BYTES) {
      this.stop("codex_output_limit");
      return;
    }
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (!this.failure) {
      const newline = this.buffer.indexOf(10);
      if (newline < 0) break;
      if (newline > MAX_LINE_BYTES) {
        this.stop("codex_output_limit");
        return;
      }
      const line = this.buffer.subarray(0, newline);
      this.buffer = this.buffer.subarray(newline + 1);
      try {
        const text = new TextDecoder("utf-8", { fatal: true })
          .decode(line)
          .trim();
        if (text) this.handleMessage(JSON.parse(text));
      } catch {
        this.stop("codex_protocol_invalid");
      }
    }
    if (this.buffer.length > MAX_LINE_BYTES) this.stop("codex_output_limit");
  };

  private handleMessage(value: unknown): void {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      this.stop("codex_protocol_invalid");
      return;
    }
    const message = value as RPCMessage;
    const hasID = Object.hasOwn(message, "id");
    if (
      hasID &&
      typeof message.id !== "string" &&
      !Number.isSafeInteger(message.id)
    ) {
      this.stop("codex_protocol_invalid");
      return;
    }
    if (typeof message.method === "string") {
      if (hasID) {
        const response = this.respond(message);
        this.responses.add(response);
        void response.finally(() => this.responses.delete(response));
      } else {
        this.options.onNotification?.(message);
        this.notifications.push(message);
      }
      return;
    }
    if (
      !hasID ||
      Object.hasOwn(message, "result") === Object.hasOwn(message, "error")
    ) {
      this.stop("codex_protocol_invalid");
      return;
    }
    const request = this.pending.get(message.id!);
    if (!request) return;
    clearTimeout(request.timeout);
    this.pending.delete(message.id!);
    if (Object.hasOwn(message, "error")) {
      request.reject(new JsonLineRpcError("codex_request_failed"));
    } else request.resolve(message.result);
  }

  private async respond(message: RPCMessage): Promise<void> {
    try {
      if (!this.options.onRequest || message.method !== "item/tool/call") {
        this.securityViolation = true;
        this.write({
          id: message.id,
          error: { code: -32_001, message: "codex_request_forbidden" },
        });
        this.notifications.push({
          method: "realize/securityViolation",
          params: { blockedMethod: message.method },
        });
        return;
      }
      const result = await this.options.onRequest(
        message.method!,
        message.params,
      );
      if (!this.failure) this.write({ id: message.id, result: result ?? null });
    } catch {
      if (this.failure) return;
      this.securityViolation = true;
      try {
        this.write({
          id: message.id,
          error: { code: -32_603, message: "codex_handler_failed" },
        });
        this.notifications.push({
          method: "realize/securityViolation",
          params: { blockedMethod: message.method },
        });
      } catch {
        this.stop("codex_transport_failed");
      }
    }
  }

  private write(message: RPCMessage): void {
    if (this.failure) throw this.failure;
    if (!this.child) throw new JsonLineRpcError("codex_not_started");
    if (!this.child.stdin.writable) {
      this.stop("codex_transport_failed");
      throw this.failure;
    }
    let line: string;
    try {
      line = `${JSON.stringify(message)}\n`;
    } catch {
      throw new JsonLineRpcError("codex_input_invalid");
    }
    if (
      Buffer.byteLength(line) > MAX_LINE_BYTES ||
      this.child.stdin.writableLength + Buffer.byteLength(line) >
        MAX_OUTPUT_BYTES
    )
      throw new JsonLineRpcError("codex_input_limit");
    try {
      this.child.stdin.write(line, (error) => {
        if (error) this.stop("codex_transport_failed");
      });
    } catch {
      this.stop("codex_transport_failed");
      throw this.failure;
    }
  }

  private stop(code: JsonLineRpcErrorCode): void {
    if (this.failure) return;
    this.failure = new JsonLineRpcError(code);
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(this.failure);
    }
    this.pending.clear();
    this.buffer = Buffer.alloc(0);
    this.options.signal?.removeEventListener("abort", this.handleAbort);
    if (code === "codex_closed") this.notifications.end();
    else this.notifications.fail(this.failure);
    if (!this.child) {
      this.finish();
      return;
    }
    this.child.stdin.end();
    this.signalProcess("SIGTERM");
    // Потомки могут держать pipes после exit лидера; сигнал адресован всей группе.
    this.forceKill = setTimeout(() => {
      this.forceKill = undefined;
      this.signalProcess("SIGKILL");
      this.child?.stdin.destroy();
      this.child?.stdout.destroy();
      this.child?.stderr.destroy();
      if (this.processClosed) this.finish();
    }, FORCE_KILL_DELAY_MS);
  }

  private signalProcess(signal: NodeJS.Signals): void {
    if (!this.child?.pid) return;
    try {
      if (process.platform !== "win32") process.kill(-this.child.pid, signal);
      else this.child.kill(signal);
    } catch {
      // ESRCH означает уже завершённую группу; системное сообщение не выдаётся.
    }
  }

  private groupExists(): boolean {
    if (!this.child?.pid || process.platform === "win32") return false;
    try {
      process.kill(-this.child.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.forceKill);
    this.options.signal?.removeEventListener("abort", this.handleAbort);
    if (this.child) {
      this.child.stdout.off("data", this.handleStdout);
      this.child.stderr.off("data", this.handleStderr);
      this.child.stdin.off("error", this.handleStreamError);
      this.child.stdout.off("error", this.handleStreamError);
      this.child.stderr.off("error", this.handleStreamError);
      this.child.off("error", this.handleProcessError);
      this.child.off("exit", this.handleExit);
      this.child.off("close", this.handleClose);
    }
    this.complete();
  }
}
