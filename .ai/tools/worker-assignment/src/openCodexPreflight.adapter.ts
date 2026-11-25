/**
 * @file .ai/tools/worker-assignment/src/openCodexPreflight.adapter.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Подключает Codex App Server и reader назначения по stdio, открывая пустую временную сессию.
 */
import { JsonLineRPCClient } from "@realize/codex-adapter/rpc";
import { READ_ONLY_SESSION_CONFIG } from "@realize/codex-adapter/read-only-config";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const threadSchema = z.object({
  thread: z.object({
    id: z.string().min(1),
    ephemeral: z.literal(true),
    cliVersion: z.string().trim().min(1).max(128).nullable().catch(null),
    environments: z.tuple([]),
  }),
  approvalPolicy: z.literal("never"),
  sandbox: z.object({
    type: z.literal("readOnly"),
    networkAccess: z.literal(false),
  }),
  instructionSources: z.tuple([]),
});
export const assignmentServerName = "realize_assignment";

/** Возвращает только операции каталога и вызова MCP. Отправка пользовательского ввода здесь недоступна. */
export async function openCodexPreflight(
  root: string,
  lock: string,
  contextId: string,
  lockSha256: string,
) {
  const directory = await mkdtemp(join(tmpdir(), "realize-assignment-codex-"));
  const server = {
    command: process.execPath,
    args: [
      "--import",
      import.meta.resolve("tsx/esm"),
      fileURLToPath(
        new URL("./serveAssignmentReader.controller.ts", import.meta.url),
      ),
      root,
      lock,
      contextId,
      lockSha256,
    ],
    cwd: directory,
    required: true,
    enabled_tools: ["repo_read_file"],
    startup_timeout_sec: 15,
  };
  const client = new JsonLineRPCClient({
    workingDirectory: directory,
    environment: {
      HOME: directory,
      CODEX_HOME: directory,
      PATH: process.env.PATH,
      LANG: "C.UTF-8",
    },
    args: [
      "app-server",
      "--listen",
      "stdio://",
      "--strict-config",
      ...Object.entries(READ_ONLY_SESSION_CONFIG).flatMap(([key, value]) => [
        "-c",
        key + "=" + JSON.stringify(value),
      ]),
    ],
    signal: AbortSignal.timeout(45000),
  });
  const close = async () => {
    try {
      await client.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
  try {
    client.start();
    await client.request("initialize", {
      clientInfo: { name: "realize-assignment-preflight", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    client.notify("initialized");
    const started = threadSchema.parse(
      await client.request("thread/start", {
        cwd: directory,
        ephemeral: true,
        environments: [],
        selectedCapabilityRoots: [],
        approvalPolicy: "never",
        sandbox: "read-only",
        baseInstructions: "",
        developerInstructions: "",
        dynamicTools: [],
        config: { mcp_servers: { [assignmentServerName]: server } },
      }),
    );
    const threadId = started.thread.id;
    return {
      threadId,
      cliVersion: started.thread.cliVersion,
      list: () =>
        client.request("mcpServerStatus/list", {
          threadId,
          limit: 100,
          detail: "full",
        }),
      call: (name: string, args: unknown) =>
        client.request("mcpServer/tool/call", {
          threadId,
          server: assignmentServerName,
          tool: name,
          arguments: args,
        }),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
