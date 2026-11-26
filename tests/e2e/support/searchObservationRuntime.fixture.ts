/**
 * @file tests/e2e/support/searchObservationRuntime.fixture.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Связывает настоящий CLI, HTTP MCP и сборщики с одноразовой PostgreSQL для browser приёмки.
 * @see documentation/architecture/repository-search.md
 */
import { randomBytes } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  searchObservationSchema,
  type SearchObservation,
} from "@realize/ai-contracts";
import { createSearchFixture } from "../../../.ai/tools/agent-search/test/createSearchFixture.adapter.mjs";
import {
  readSearchObservationSpool,
  enqueueSearchObservation,
} from "../../../.ai/tools/agent-search/src/searchObservationSpool.adapter.mjs";
import { openMcpPayload } from "../../../services/internal-mcp/src/openMcpPayload.adapter";
import { createMcpHttpServer } from "../../../services/internal-mcp/src/createMcpHttpServer.controller";
import { McpError } from "../../../services/internal-mcp/src/Mcp.error";
import { createRepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { LocalSearchObservationCollector } from "../../../services/ai-control-plane/src/LocalSearchObservationCollector.service";
import { SearchObservationCollector } from "../../../packages/payload-ai-plugin/src/search-observability/SearchObservationCollector.service";
import { SearchObservationStore } from "../../../packages/payload-ai-plugin/src/search-observability/SearchObservationStore.repository";
import type { SearchObservationDatabase } from "../../../packages/payload-ai-plugin/src/search-observability/SearchObservationStore.types";

export async function createSearchObservationRuntime() {
  const uri = new URL(process.env.SEARCH_TEST_DATABASE_URI ?? "http://invalid");
  if (
    process.env.SEARCH_ACCEPTANCE_BROWSER !== "true" ||
    uri.hostname !== "127.0.0.1" ||
    !/^\/realize_search_fixture_[a-z0-9]+$/.test(uri.pathname) ||
    uri.href !== process.env.DATABASE_URI
  )
    throw new Error("ISOLATED_SEARCH_ACCEPTANCE_REQUIRED");
  const cleanups: Array<() => void | Promise<void>> = [];
  const close = async () => {
    const errors = [];
    for (const cleanup of cleanups.splice(0).reverse())
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    if (errors.length)
      throw new AggregateError(errors, "Не завершена очистка search fixture");
  };
  try {
    const fixture = createSearchFixture(
      { after: (cleanup: () => void) => cleanups.push(cleanup) },
      { populate: false },
    );
    fixture.write(
      "src/acceptance.ts",
      "export function searchAcceptanceTarget() { return 'ქართული Русский English العربية 漢字 👩🏽‍💻 é'; }\r\n",
    );
    const payload = await openMcpPayload();
    cleanups.push(() => payload.destroy());
    const store = new SearchObservationStore(
      payload.db as SearchObservationDatabase,
    );
    let unavailable = true;
    let delivered = 0;
    const delivery = {
      control: store.control,
      append: async (
        events: SearchObservation[],
        origin: "runtime" | "import",
      ) => {
        // Контролируемый отказ delivery port; сам поиск и monitor работают, PostgreSQL хранит реальные данные.
        if (unavailable) throw new Error("FIXTURE_DELIVERY_UNAVAILABLE");
        const inserted = await store.append(events, origin);
        delivered++;
        return inserted;
      },
    };
    const cli = new LocalSearchObservationCollector(
      fixture.root,
      delivery,
      () => {},
    );
    cleanups.push(() => cli.close());
    const mcp = new SearchObservationCollector(delivery, () => {});
    cleanups.push(() => mcp.close());
    const observed: SearchObservation[] = [];
    const token = randomBytes(32).toString("base64url");
    const server = await createMcpHttpServer({
      port: 0,
      policy: await createRepositoryReadPolicy(fixture.root, true),
      authorize: async (credential) => {
        if (credential !== token)
          throw new McpError("FORBIDDEN", "Недействительный ключ fixture", 401);
        return {
          principalID: "search-acceptance",
          installationID: "fixture",
          repositoryRead: true,
          pagesRead: false,
          allowedTools: ["repo_search"],
          limits: {
            callsPerMinute: 60,
            burst: 10,
            concurrentCalls: 2,
            responseBytes: 8192,
          },
        };
      },
      observeSearch: (event) => {
        observed.push(event);
        mcp.record(event);
      },
    });
    cleanups.push(() => server.close());
    const client = new Client({ name: "search-acceptance", version: "1.0.0" });
    cleanups.push(() => client.close());
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${server.origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    const runCLI = () => {
      const start = performance.now();
      const result = fixture.run([
        "--within=src",
        "--intent=definitions",
        "searchAcceptanceTarget",
      ]);
      const wallMs = performance.now() - start;
      if (
        result.status !== 0 ||
        !result.stdout.includes("src/acceptance.ts:1:")
      )
        throw new Error("CLI acceptance target missing");
      const rows = readSearchObservationSpool(fixture.root).rows;
      const event = searchObservationSchema.parse(
        JSON.parse(String(rows.at(-1)?.payload)),
      );
      return { event, wallMs };
    };
    return {
      store,
      cli,
      mcp,
      close,
      runCLI,
      observed,
      recover: () => {
        unavailable = false;
      },
      delivered: () => delivered,
      searchMCP: () =>
        client.callTool({
          name: "repo_search",
          arguments: {
            query: "searchAcceptanceTarget",
            path: "src",
            intent: "definitions",
            caseSensitive: true,
            limit: 5,
          },
        }),
      replay: (event: SearchObservation) =>
        event.source === "cli"
          ? enqueueSearchObservation(fixture.root, event)
          : mcp.record(event),
    };
  } catch (error) {
    await close();
    throw error;
  }
}
