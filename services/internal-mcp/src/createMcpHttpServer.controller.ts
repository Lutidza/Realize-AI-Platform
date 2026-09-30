/**
 * @file services/internal-mcp/src/createMcpHttpServer.controller.ts
 * @version 1.2.0
 * @date 2026-09-26
 * @description Обслуживает loopback HTTP с Host/Origin/auth/body guards перед официальным SDK.
 */
import { MCP_WORKSHOP_REQUEST_BYTES } from "@realize/ai-contracts";
import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { RepositoryCursorService } from "../../ai-control-plane/src/RepositoryCursor.service";
import { McpCallBudget } from "./McpCallBudget.service";
import { McpError } from "./Mcp.error";
import { createMcpRegistry } from "./createMcpRegistry.config";
import type { McpRuntimeOptions } from "./McpRuntime.types";

/** port=0 используется только programmatic тестами; CLI разрешает фиксированный непривилегированный port. */
export async function createMcpHttpServer(options: McpRuntimeOptions) {
  const stopping = new AbortController();
  const cursors = new RepositoryCursorService();
  const budget = new McpCallBudget();
  const pending = new Set<Promise<void>>();
  let port = options.port;
  const server = createServer((req, res) => {
    const work = (async () => {
      const fail = (status: number, message: string) => {
        if (!res.headersSent) {
          res.writeHead(status, {
            "content-type": "text/plain; charset=utf-8",
            ...(status === 401
              ? { "www-authenticate": 'Bearer realm="realize-mcp"' }
              : {}),
          });
          res.end(message);
        }
      };
      try {
        if (
          ![`127.0.0.1:${port}`, `localhost:${port}`].includes(
            req.headers.host ?? "",
          )
        )
          return fail(403, "Host is not allowed.");
        const origin = req.headers.origin;
        if (
          origin !== undefined &&
          ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(
            origin,
          )
        )
          return fail(403, "Origin is not allowed.");
        if (req.method === "GET" && req.url === "/health") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end('{"status":"ok","version":"1.2.0"}');
          return;
        }
        if (req.url !== "/mcp") return fail(404, "Not found.");
        if (stopping.signal.aborted || pending.size >= 32)
          return fail(503, "Service unavailable.");
        const header = req.headers.authorization ?? "";
        if (!/^Bearer [A-Za-z0-9._~-]{32,1024}$/.test(header))
          return fail(401, "Bearer credential required.");
        const credential = header.slice(7);
        const principal = await options.authorize(credential);
        const requestLimit =
          principal.workshopWrite === true ? MCP_WORKSHOP_REQUEST_BYTES : 65536;
        if (Number(req.headers["content-length"] ?? 0) > requestLimit)
          return fail(413, "Request body exceeds limit.");
        let size = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > requestLimit) {
            fail(413, "Request body exceeds limit.");
            return;
          }
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);
        const handler = createMcpHandler(
          () =>
            createMcpRegistry(
              principal,
              credential,
              options,
              cursors,
              budget,
              stopping.signal,
            ),
          { legacy: "stateless", maxSubscriptions: 0 },
        );
        try {
          await toNodeHandler({
            fetch: async (request, context) => {
              const response = await handler.fetch(request, context);
              // Транспорт уже сформировал ответ; конечный ceiling включает SDK envelope и JSON escaping.
              const bytes = new Uint8Array(await response.arrayBuffer());
              if (bytes.byteLength > 131072)
                return new Response("Response exceeds limit.", { status: 413 });
              return new Response(bytes.byteLength ? bytes : null, {
                status: response.status,
                headers: response.headers,
              });
            },
          })(
            {
              method: req.method,
              url: req.url,
              headers: req.headers,
              async *[Symbol.asyncIterator]() {
                if (body.length) yield body;
              },
            },
            res,
          );
        } finally {
          await handler.close();
        }
      } catch (error) {
        fail(
          error instanceof McpError ? error.httpStatus : 503,
          error instanceof McpError && error.httpStatus === 401
            ? "Invalid credential."
            : "Service unavailable.",
        );
      }
    })();
    pending.add(work);
    void work.finally(() => pending.delete(work));
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("MCP listener did not bind.");
  port = address.port;
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      stopping.abort();
      const closed = new Promise<void>((resolve) =>
        server.close(() => resolve()),
      );
      const force = setTimeout(() => server.closeAllConnections(), 5000);
      try {
        await Promise.allSettled([...pending]);
        await options.pages?.close();
        await options.close?.();
        await closed;
      } finally {
        clearTimeout(force);
      }
    })());
  return { server, origin: `http://127.0.0.1:${port}`, close };
}
