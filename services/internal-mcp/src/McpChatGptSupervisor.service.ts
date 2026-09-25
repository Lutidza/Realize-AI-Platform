/**
 * @file services/internal-mcp/src/McpChatGptSupervisor.service.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Ведёт official tunnel-client с private health socket и credentials только в памяти child.
 * @see documentation/specifications/internal-mcp.md
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  McpChatGptRuntimePort,
  McpChatGptLaunchPlan,
} from "../../../packages/payload-ai-plugin/src/integrations/mcp/McpChatGptRuntime.types";

/** Один supervisor принадлежит одному managed instance; внешние commands/env не принимаются. */
export class McpChatGptSupervisor {
  private child?: ChildProcess;
  private ended?: Promise<void>;
  private directory?: string;
  private revision?: number;
  private startedAt = 0;
  private retryAt = 0;
  private exited = false;

  constructor(private readonly runtime: McpChatGptRuntimePort) {}

  async refresh(): Promise<void> {
    let plan: McpChatGptLaunchPlan | undefined;
    try {
      plan = await this.runtime.read();
      if (!plan.connection) {
        await this.stop();
        await this.runtime.report(plan.revision, plan.status);
        return;
      }
      const changed = this.revision !== plan.revision;
      if (changed || this.exited) await this.stop();
      if (changed) this.retryAt = 0;
      if (!this.child) {
        if (Date.now() < this.retryAt) {
          await this.runtime.report(plan.revision, "failed");
          return;
        }
        await this.start(plan);
      }
      const ready = await this.ready();
      await this.runtime.report(
        plan.revision,
        ready && !this.exited
          ? "connected"
          : Date.now() - this.startedAt < 45000 && !this.exited
            ? "starting"
            : "failed",
      );
    } catch {
      // Потеря БД/прав/child запрещает stale соединение; raw ошибки могут содержать секреты.
      await this.stop();
      if (plan)
        await this.runtime
          .report(plan.revision, "failed")
          .catch(() => undefined);
    }
  }

  private async start(plan: McpChatGptLaunchPlan): Promise<void> {
    const connection = plan.connection!;
    this.directory = await mkdtemp(join(tmpdir(), "realize-mcp-tunnel-"));
    this.revision = plan.revision;
    this.startedAt = Date.now();
    this.exited = false;
    const child = spawn(
      connection.executable,
      [
        "run",
        "--profile-dir",
        this.directory,
        "--control-plane.api-key",
        "env:CONTROL_PLANE_API_KEY",
        "--control-plane.tunnel-id",
        connection.tunnelID,
        "--mcp.server-url",
        `url=http://127.0.0.1:${connection.port}/mcp,channel=main`,
        "--mcp.extra-headers",
        "Authorization: env:REALIZE_MCP_TUNNEL_AUTHORIZATION",
        "--mcp.discovery-extra-headers",
        "Authorization: env:REALIZE_MCP_TUNNEL_AUTHORIZATION",
        "--mcp.startup-wait-timeout",
        "30s",
        "--mcp.max-concurrent-requests",
        "4",
        "--health.unix-socket",
        join(this.directory, "health.sock"),
        "--log.level",
        "error",
        "--log.format",
        "json",
      ],
      {
        cwd: this.directory,
        shell: false,
        stdio: "ignore",
        env: {
          NODE_ENV: "production",
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          CONTROL_PLANE_API_KEY: connection.apiKey,
          REALIZE_MCP_TUNNEL_AUTHORIZATION: `Bearer ${connection.mcpToken}`,
        },
      },
    );
    this.child = child;
    this.ended = new Promise<void>((resolve) => {
      const finish = () => {
        this.exited = true;
        this.retryAt = Date.now() + 10000;
        resolve();
      };
      child.once("error", finish);
      child.once("exit", finish);
    });
  }

  private async ready(): Promise<boolean> {
    if (!this.directory || this.exited) return false;
    return new Promise<boolean>((resolve) => {
      const request = get(
        {
          socketPath: join(this.directory!, "health.sock"),
          path: "/readyz",
          timeout: 1000,
        },
        (response) => {
          // Тело не читается и не сохраняется: readiness endpoint имеет контракт по HTTP status.
          const ready = response.statusCode === 200;
          response.destroy();
          resolve(ready);
        },
      );
      request.on("timeout", () => request.destroy());
      request.on("error", () => resolve(false));
    });
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (child && !this.exited) {
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      try {
        await this.ended;
      } finally {
        clearTimeout(timer);
      }
    }
    this.child = undefined;
    this.ended = undefined;
    if (this.directory) {
      await rm(this.directory, { recursive: true, force: true });
      this.directory = undefined;
    }
  }
}
