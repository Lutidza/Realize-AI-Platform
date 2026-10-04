/**
 * @file services/ai-control-plane/src/chatContextRoutes.controller.ts
 * @version 1.1.0
 * @date 2026-09-30
 * @description Обслуживает авторизованный бинарный relay и ограниченный каталог контекста.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_PROJECT_FILE_LIMIT,
  parseCreateMessageInput,
  mcpToolInputs,
} from "@realize/ai-contracts";
import type { ChatCapabilitiesDto } from "@realize/ai-contracts";
import { ChatAssetStore } from "./ChatAssetStore.repository";
import { matchProjectFiles } from "./matchProjectFiles.validator";
import { collectProjectContext } from "./projectContextCatalog.service";
import { readControlPlaneJSON } from "./readControlPlaneJSON.service";
import { createRepositoryReadPolicy } from "./repositoryReadPolicy.validator";
import { RepositoryCursorService } from "./RepositoryCursor.service";
import { readRepositoryLines } from "./readRepositoryLines.service";

const json = (response: ServerResponse, data: unknown, status = 200): void => {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
};

/** Вызывается только после существующей server-to-server проверки bearer token. */
export const handleChatContextRoute = async (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  assets: ChatAssetStore,
  workspaceRoot: string,
): Promise<boolean> => {
  if (request.method === "GET" && url.pathname === "/v1/chat/project-file") {
    const input = mcpToolInputs.repo_read_file.parse({
      path: url.searchParams.get("path"),
      startLine: Number(url.searchParams.get("startLine") ?? 1),
      lineCount: 100,
      expectedSha256: url.searchParams.get("expectedSha256") ?? undefined,
    });
    json(
      response,
      await readRepositoryLines(
        {
          policy: await createRepositoryReadPolicy(
            workspaceRoot,
            url.searchParams.get("developerInstructions") === "true",
          ),
          principal: "chat-source-link",
          cursors: new RepositoryCursorService(),
          signal: AbortSignal.timeout(10000),
        },
        input,
      ),
    );
    return true;
  }
  if (request.method === "GET" && url.pathname === "/v1/chat/capabilities") {
    const capabilities: ChatCapabilitiesDto = {
      attachments: {
        ...CHAT_ATTACHMENT_LIMITS,
        mimeTypes: [...CHAT_ATTACHMENT_LIMITS.mimeTypes],
        extensions: [...CHAT_ATTACHMENT_LIMITS.extensions],
        available: await assets.available(),
      },
      projectFiles: { available: true, maxFiles: CHAT_PROJECT_FILE_LIMIT },
      webSearch: { available: true },
    };
    json(response, capabilities);
    return true;
  }
  if (request.method === "GET" && url.pathname === "/v1/chat/project-files") {
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if (query.length > 128) throw new Error("File search is too long.");
    const entries = await collectProjectContext(workspaceRoot, {
      query,
      limit: 101,
    });
    json(response, {
      files: entries.slice(0, 100).map(({ file }) => file),
      truncated: entries.length > 100,
    });
    return true;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/v1/chat/project-files/resolve"
  ) {
    const body = await readControlPlaneJSON(request);
    const { projectFiles = [] } = parseCreateMessageInput({
      content: "resolve",
      projectFiles: body.files,
    });
    const entries = await collectProjectContext(workspaceRoot, {
      paths: new Set(projectFiles.map((file) => file.path)),
    });
    json(response, { files: matchProjectFiles(entries, projectFiles) });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/v1/chat/assets") {
    const metadata = await assets.upload({
      name: decodeURIComponent(
        String(request.headers["x-attachment-name"] ?? ""),
      ),
      mimeType: String(request.headers["content-type"] ?? "").split(";")[0],
      chunks: request,
    });
    json(response, metadata, 201);
    return true;
  }
  const match = url.pathname.match(
    /^\/v1\/chat\/assets\/([a-f0-9-]{36})(?:\/(file|claim))?$/,
  );
  if (!match) return false;
  const [, id, action] = match;
  if (request.method === "DELETE" && !action) {
    await assets.remove(id);
    json(response, { deleted: true });
    return true;
  }
  if (request.method === "GET" && !action) {
    json(response, await assets.metadata(id, true));
    return true;
  }
  if (request.method === "GET" && action === "file") {
    const { metadata, data } = await assets.read(id);
    response.writeHead(200, {
      "Content-Type": metadata.mimeType,
      "Content-Length": data.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${metadata.kind === "image" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,
    });
    response.end(data);
    return true;
  }
  if (request.method === "POST" && action === "claim") {
    const body = await readControlPlaneJSON(request);
    if (
      typeof body.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.sha256) ||
      typeof body.runID !== "string"
    )
      throw new Error("Invalid attachment claim.");
    await assets.claim({ id, sha256: body.sha256 }, body.runID);
    json(response, { linked: true });
    return true;
  }
  return false;
};
