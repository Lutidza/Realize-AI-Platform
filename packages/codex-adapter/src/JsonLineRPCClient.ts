/**
 * @file packages/codex-adapter/src/JsonLineRPCClient.ts
 * @version 2026-08-21
 * @description Implements private stdio JSONL transport for one Codex App Server process.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { AsyncQueue } from "./AsyncQueue";
import type { JSONRPCID, RPCMessage } from "./protocol";

type PendingRequest = {
  reject: (reason: Error) => void;
  resolve: (value: unknown) => void;
  timeout: NodeJS.Timeout;
};

/** Spawn configuration for one isolated App Server subprocess. */
export type JsonLineRPCClientOptions = {
  codexBinary?: string;
  environment?: NodeJS.ProcessEnv;
  workingDirectory: string;
};

/** Correlates JSON-RPC requests and streams notifications over one stdio process. */
export class JsonLineRPCClient {
  private buffer = "";
  private closed = false;
  private nextID = 1;
  private readonly notifications = new AsyncQueue<RPCMessage>();
  private readonly pending = new Map<JSONRPCID, PendingRequest>();
  private process?: ChildProcessWithoutNullStreams;
  private stderr = "";

  constructor(private readonly options: JsonLineRPCClientOptions) {}

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Codex App Server closed before responding."));
    }
    this.pending.clear();
    this.notifications.end();

    if (this.process && this.process.exitCode === null) {
      this.process.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const forceKill = setTimeout(() => {
          if (this.process?.exitCode === null) this.process.kill("SIGKILL");
          resolve();
        }, 2_000);
        forceKill.unref();

        this.process?.once("exit", () => {
          clearTimeout(forceKill);
          resolve();
        });
      });
    }
  }

  getNotifications(): AsyncIterable<RPCMessage> {
    return this.notifications;
  }

  notify(method: string, params?: Record<string, unknown>): void {
    this.write({ method, ...(params ? { params } : {}) });
  }

  async request<T>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const id = this.nextID++;
    const result = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex App Server timed out handling ${method}.`));
      }, 30_000);

      this.pending.set(id, { reject, resolve, timeout });
    });

    this.write({ id, method, ...(params ? { params } : {}) });
    return (await result) as T;
  }

  start(): void {
    if (this.process) throw new Error("Codex App Server is already running.");

    const process = spawn(
      this.options.codexBinary || "codex",
      [
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
      ],
      {
        cwd: this.options.workingDirectory,
        env: this.options.environment,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    this.process = process;
    process.stdout.setEncoding("utf8");
    process.stderr.setEncoding("utf8");
    process.stdout.on("data", (chunk: string) => this.handleChunk(chunk));
    process.stderr.on("data", (chunk: string) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-8_000);
    });
    process.on("error", (error) => this.fail(error));
    process.on("exit", (code, signal) => {
      if (this.closed) return;
      const detail =
        this.stderr.trim() ||
        `exit code ${String(code)}, signal ${String(signal)}`;
      this.fail(new Error(`Codex App Server exited unexpectedly: ${detail}`));
    });
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
    this.notifications.fail(error);
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk;

    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;

      let message: RPCMessage;
      try {
        message = JSON.parse(line) as RPCMessage;
      } catch {
        this.fail(new Error("Codex App Server emitted invalid JSONL."));
        return;
      }

      if (
        message.id !== undefined &&
        (message.result !== undefined || message.error)
      ) {
        const request = this.pending.get(message.id);
        if (!request) continue;
        clearTimeout(request.timeout);
        this.pending.delete(message.id);

        if (message.error)
          request.reject(
            new Error(message.error.message || "Codex request failed."),
          );
        else request.resolve(message.result);
        continue;
      }

      if (message.id !== undefined && message.method) {
        this.write({
          error: {
            code: -32_001,
            message:
              "Server-initiated requests are disabled for non-interactive runs.",
          },
          id: message.id,
        });
        this.notifications.push({
          method: "realize/securityViolation",
          params: { blockedMethod: message.method },
        });
        continue;
      }

      this.notifications.push(message);
    }
  }

  private write(message: RPCMessage): void {
    if (!this.process || this.closed || !this.process.stdin.writable) {
      throw new Error("Codex App Server transport is not writable.");
    }

    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }
}
