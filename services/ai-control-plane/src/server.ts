/**
 * @file services/ai-control-plane/src/server.ts
 * @version 2026-08-21
 * @description Exposes the loopback-only development control plane for read-only Codex runs.
 */

import "dotenv/config";

import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";

import type { AgentEvent, AIStreamEvent } from "@realize/ai-contracts";
import { encodeSSE } from "@realize/ai-contracts";
import { buildReadOnlyDeveloperInstructions } from "@realize/change-engine";
import {
  createCodexEnvironment,
  OpenAICodexAdapter,
} from "@realize/codex-adapter";

import { createContextSnapshot } from "./contextSnapshot";
import { RunStore, type ControlPlaneRun } from "./runStore";

const host = process.env.REALIZE_AI_CONTROL_PLANE_HOST || "127.0.0.1";
const port = Number(process.env.REALIZE_AI_CONTROL_PLANE_PORT || 3100);
const token = process.env.REALIZE_AI_CONTROL_PLANE_TOKEN || "";
const workspaceRoot = resolve(
  process.env.REALIZE_AI_WORKSPACE_ROOT || process.cwd(),
);

if (host !== "127.0.0.1" && host !== "::1") {
  throw new Error("The development control plane may only bind to loopback.");
}
if (!Number.isInteger(port) || port < 1 || port > 65_535)
  throw new Error("Invalid control-plane port.");
if (token.length < 32)
  throw new Error(
    "REALIZE_AI_CONTROL_PLANE_TOKEN must contain at least 32 characters.",
  );

const adapter = new OpenAICodexAdapter({
  environment: createCodexEnvironment(),
});
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

const readJSON = async (
  request: IncomingMessage,
): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 16_384) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }

  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be an object.");
  }
  return parsed as Record<string, unknown>;
};

const publicRun = (
  run: ControlPlaneRun,
): Omit<ControlPlaneRun, "cancelRequested" | "events" | "prompt"> => ({
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

  try {
    snapshot = await createContextSnapshot(workspaceRoot);
    if (run.cancelRequested) return;
    const instructions = `${buildReadOnlyDeveloperInstructions()}\nContext Pack contains ${snapshot.fileCount} files (${snapshot.totalBytes} bytes).`;

    for await (const event of adapter.runTurn({
      cwd: snapshot.root,
      developerInstructions: instructions,
      model: run.model,
      prompt: run.prompt,
      runID: run.id,
      threadID: run.threadID,
    })) {
      if (run.cancelRequested) {
        await adapter.cancelRun(run.id);
        break;
      }
      applyAgentEvent(run, event);
    }
  } catch (error) {
    if (!run.cancelRequested) {
      run.status = "failed";
      store.append(run.id, "run.failed", { message: sanitizeError(error) });
    }
  } finally {
    await snapshot?.cleanup();
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
      store.append(run.id, event.type, { content: event.content });
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

    if (request.method === "GET" && url.pathname === "/v1/status") {
      json(response, 200, {
        service: "realize-ai-control-plane",
        state: "ready",
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/runs") {
      const body = await readJSON(request);
      if (
        typeof body.runID !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(body.runID)
      ) {
        throw new Error("runID is invalid.");
      }
      if (
        typeof body.prompt !== "string" ||
        body.prompt.trim().length < 1 ||
        body.prompt.length > 8_000
      ) {
        throw new Error("prompt is invalid.");
      }
      if (body.threadID !== undefined && typeof body.threadID !== "string") {
        throw new Error("threadID is invalid.");
      }
      if (body.model !== undefined && typeof body.model !== "string") {
        throw new Error("model is invalid.");
      }

      const existing = store.get(body.runID);
      if (existing) {
        json(response, 200, { run: publicRun(existing) });
        return;
      }

      const run = store.create({
        id: body.runID,
        model: body.model,
        prompt: body.prompt.trim(),
        threadID: body.threadID,
      });
      void executeRun(run);
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
      await adapter.cancelRun(run.id);
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
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
