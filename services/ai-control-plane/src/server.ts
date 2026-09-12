/**
 * @file services/ai-control-plane/src/server.ts
 * @version 1.2.1
 * @date 2026-09-11
 * @description Предоставляет loopback control plane для read-only запуска выбранной интеграции Codex.
 */

import { config as loadEnvironment } from "dotenv";

import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import type { AgentEvent, AIStreamEvent } from "@realize/ai-contracts";
import { encodeSSE } from "@realize/ai-contracts";
import { buildConfiguredChatTurn } from "./buildConfiguredChatTurn.service";
import { OpenAICodexAdapter } from "@realize/codex-adapter";
import type { CodexConnectionLease } from "@realize/payload-ai-control/server/integration-runtime";

import { materializeChatAttachments } from "./materializeChatAttachments.service";
import { ChatAssetStore } from "./ChatAssetStore.repository";
import { handleChatContextRoute } from "./chatContextRoutes.controller";
import { parseChatRun } from "./parseChatRun.validator";
import { readControlPlaneJSON } from "./readControlPlaneJSON.service";

import { createContextSnapshot } from "./contextSnapshot";
import { createCodexRuntime } from "./createCodexRuntime.config";
import { RunStore, type ControlPlaneRun } from "./runStore";
import { readControlPlaneConfig } from "./readControlPlaneConfig.config";

loadEnvironment({ path: ".env.local", quiet: true });
loadEnvironment({ quiet: true });

const { host, port, token, workspaceRoot } = readControlPlaneConfig();

const assets = new ChatAssetStore(
  process.env.REALIZE_AI_CHAT_ASSET_ROOT,
  workspaceRoot,
);
const cleanupAssets = setInterval(
  () => {
    void assets.cleanup().catch(() => undefined);
  },
  60 * 60 * 1000,
);
cleanupAssets.unref();
const runtime = createCodexRuntime();
const activeAdapters = new Map<string, OpenAICodexAdapter>();
const executions = new Map<string, Promise<void>>();
const store = new RunStore();

const isAuthorized = (request: IncomingMessage): boolean => {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(value.slice(7));
  const expected = Buffer.from(token);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
};

const json = (
  response: ServerResponse,
  status: number,
  body: unknown,
): void => {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
};

const publicRun = (
  run: ControlPlaneRun,
): Pick<ControlPlaneRun, "id" | "model" | "status" | "threadID"> => ({
  id: run.id,
  model: run.model,
  status: run.status,
  threadID: run.threadID,
});

const sanitizeError = (error: unknown): string => {
  const message =
    error instanceof Error ? error.message : "Control-plane run failed.";
  return message.replaceAll(workspaceRoot, "[workspace]").slice(0, 500);
};

const executeRun = async (run: ControlPlaneRun): Promise<void> => {
  let snapshot: Awaited<ReturnType<typeof createContextSnapshot>> | undefined;
  let lease: CodexConnectionLease | undefined;
  let completion: AgentEvent | undefined;

  try {
    lease = await runtime.codex.acquire();
    const adapter = new OpenAICodexAdapter({
      codexBinary: process.env.REALIZE_CODEX_BINARY || undefined,
      environment: lease.environment,
      privateReadDenyPaths: process.env.REALIZE_AI_CHAT_ASSET_ROOT
        ? [process.env.REALIZE_AI_CHAT_ASSET_ROOT]
        : [],
      signal: lease.signal,
    });
    activeAdapters.set(run.id, adapter);
    snapshot = await createContextSnapshot(workspaceRoot, run.projectFiles);
    const context = await materializeChatAttachments(
      assets,
      run.attachments ?? [],
      run.id,
      snapshot.root,
    );
    if (run.cancelRequested) return;
    const turn = buildConfiguredChatTurn({
      run,
      fileCount: snapshot.fileCount,
      totalBytes: snapshot.totalBytes,
      selectedFiles: snapshot.selectedFiles,
      attachmentInstructions: context.instructions,
    });

    for await (const event of adapter.runTurn({
      cwd: snapshot.root,
      sandboxProfile: "analysis-readonly",
      images: context.images,
      webSearch: run.webSearch,
      developerInstructions: turn.developerInstructions,
      model: run.model,
      prompt: turn.prompt,
      runID: run.id,
      threadID: run.threadID,
    })) {
      if (run.cancelRequested) {
        await adapter.cancelRun(run.id);
        break;
      }
      if (event.type === "assistant.completed") completion = event;
      else applyAgentEvent(run, event);
    }
    await lease.dispose();
    lease = undefined;
    if (completion && !run.cancelRequested) applyAgentEvent(run, completion);
  } catch (error) {
    if (!run.cancelRequested) {
      run.status = "failed";
      store.append(run.id, "run.failed", { message: sanitizeError(error) });
    }
  } finally {
    activeAdapters.delete(run.id);
    try {
      await lease?.dispose();
    } catch (error) {
      if (!run.cancelRequested) {
        run.status = "failed";
        store.append(run.id, "run.failed", { message: sanitizeError(error) });
      }
    } finally {
      await snapshot?.cleanup();
    }
  }
};

const applyAgentEvent = (run: ControlPlaneRun, event: AgentEvent): void => {
  switch (event.type) {
    case "run.started":
      run.status = "running";
      run.threadID = event.threadID;
      store.append(run.id, event.type, { threadID: event.threadID });
      break;
    case "assistant.delta":
      store.append(run.id, event.type, { delta: event.delta });
      break;
    case "assistant.completed":
      run.status = "completed";
      store.append(run.id, event.type, {
        content: event.content,
        sources: event.sources ?? [],
      });
      break;
    case "tool.started":
      store.append(
        run.id,
        event.type,
        { summary: event.summary },
        "internal-summary",
      );
      break;
    case "tool.completed":
      store.append(
        run.id,
        event.type,
        {
          durationMs: event.durationMs,
          status: event.status,
          summary: event.summary,
        },
        "internal-summary",
      );
      break;
    case "usage.updated":
      store.append(run.id, event.type, { usage: event.usage });
      break;
    case "run.cancelled":
      run.status = "cancelled";
      store.append(run.id, event.type, {});
      break;
    case "run.failed":
      run.status = "failed";
      store.append(run.id, event.type, { message: event.message });
      break;
  }
};

const writeEvent = (response: ServerResponse, event: AIStreamEvent): void => {
  response.write(encodeSSE(event));
};

const streamRun = (
  request: IncomingMessage,
  response: ServerResponse,
  run: ControlPlaneRun,
): void => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const after = Number(url.searchParams.get("after") || 0);
  const afterSequence = Number.isInteger(after) && after >= 0 ? after : 0;

  response.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  for (const event of store.getEvents(run.id, afterSequence))
    writeEvent(response, event);

  if (["cancelled", "completed", "failed"].includes(run.status)) {
    response.end();
    return;
  }

  const unsubscribe = store.subscribe(run.id, (event) => {
    writeEvent(response, event);
    if (
      ["run.cancelled", "assistant.completed", "run.failed"].includes(
        event.type,
      )
    )
      response.end();
  });
  const heartbeat = setInterval(
    () => response.write(": heartbeat\n\n"),
    15_000,
  );
  heartbeat.unref();
  response.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);

    if (request.method === "GET" && url.pathname === "/health") {
      json(response, 200, {
        service: "realize-ai-control-plane",
        status: "ok",
      });
      return;
    }
    if (!isAuthorized(request)) {
      json(response, 401, { error: "unauthorized" });
      return;
    }

    if (
      await handleChatContextRoute(
        request,
        response,
        url,
        assets,
        workspaceRoot,
      )
    )
      return;

    if (request.method === "GET" && url.pathname === "/v1/status") {
      json(response, 200, {
        service: "realize-ai-control-plane",
        state: "ready",
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/runs") {
      const input = parseChatRun(
        await readControlPlaneJSON(request, 8 * 1024 * 1024 + 64 * 1024),
      );
      const existing = store.get(input.id);
      if (existing) {
        store.create(input);
        json(response, 200, { run: publicRun(existing) });
        return;
      }

      const run = store.create(input);
      const execution = executeRun(run).finally(() =>
        executions.delete(run.id),
      );
      executions.set(run.id, execution);
      void execution.catch(() => undefined);
      json(response, 202, { run: publicRun(run) });
      return;
    }

    const runMatch = url.pathname.match(/^\/v1\/runs\/([A-Za-z0-9_-]{1,128})$/);
    if (request.method === "GET" && runMatch) {
      const run = store.get(runMatch[1]);
      if (!run) json(response, 404, { error: "not_found" });
      else json(response, 200, { run: publicRun(run) });
      return;
    }

    const eventsMatch = url.pathname.match(
      /^\/v1\/runs\/([A-Za-z0-9_-]{1,128})\/events$/,
    );
    if (request.method === "GET" && eventsMatch) {
      const run = store.get(eventsMatch[1]);
      if (!run) json(response, 404, { error: "not_found" });
      else streamRun(request, response, run);
      return;
    }

    const cancelMatch = url.pathname.match(
      /^\/v1\/runs\/([A-Za-z0-9_-]{1,128})\/cancel$/,
    );
    if (request.method === "POST" && cancelMatch) {
      const run = store.get(cancelMatch[1]);
      if (!run) {
        json(response, 404, { error: "not_found" });
        return;
      }
      if (["cancelled", "completed", "failed"].includes(run.status)) {
        json(response, 200, { run: publicRun(run) });
        return;
      }
      run.cancelRequested = true;
      await activeAdapters.get(run.id)?.cancelRun(run.id);
      run.status = "cancelled";
      store.append(run.id, "run.cancelled", {});
      json(response, 202, { run: publicRun(run) });
      return;
    }

    json(response, 404, { error: "not_found" });
  } catch (error) {
    json(response, 400, { error: sanitizeError(error) });
  }
});

server.listen(port, host, () => {
  console.log(
    `[ai-control-plane] listening on http://${host}:${port}; workspace=${workspaceRoot}`,
  );
});

const shutdown = (): void => {
  clearInterval(cleanupAssets);
  server.close();
  void Promise.allSettled(
    [...activeAdapters].map(([runID, adapter]) => adapter.cancelRun(runID)),
  )
    .then(() => Promise.allSettled(executions.values()))
    .then(() => runtime.dispose())
    .then(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
