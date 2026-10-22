/**
 * @file tests/int/repositoryMcpBridge.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет native MCP transport: каталог, Git HEAD, JSON, hashes, права и завершение run.
 */
// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { createRepositoryMcpBridge } from "../../services/ai-control-plane/src/createRepositoryMcpBridge.service";
import { createRepositoryChatTools } from "../../services/ai-control-plane/src/repositoryChatTools.adapter";
import { createRepositoryReadPolicy } from "../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { createRepositoryRunAccess } from "../../services/ai-control-plane/src/createRepositoryRunAccess.service";
import { SearchObservationCollector } from "../../packages/payload-ai-plugin/src/search-observability/SearchObservationCollector.service";
import type { SearchObservation } from "@realize/ai-contracts";
import {
  enqueueSearchObservation,
  readSearchObservationSpool,
} from "../../.ai/tools/agent-search/src/searchObservationSpool.adapter.mjs";
import { LocalSearchObservationCollector } from "../../services/ai-control-plane/src/LocalSearchObservationCollector.service";
import { searchObservationFixture } from "./searchObservation.fixture";
import { createRepositoryGitHeadFixture } from "./fixtures/repositoryGitHead.fixture";

describe("Native repository MCP bridge", () => {
  it("переносит CLI spool worktree владельцу установки перед cleanup и доставляет после восстановления", async () => {
    const root = await mkdtemp(join(tmpdir(), "realize-cli-worktree-"));
    const owner = await mkdtemp(join(tmpdir(), "realize-cli-installation-"));
    let bridge;
    let restarted;
    const events: SearchObservation[] = [];
    let available = false;
    const store = {
      append: async (batch: SearchObservation[]) => {
        if (!available) throw Error("fixture_db_offline");
        events.push(...batch);
        return batch.length;
      },
      control: { maintain: async () => ({ revision: 1, cleaned: false }) },
    };
    try {
      for (const directory of [root, owner])
        await mkdir(join(directory, ".ai/tools/agent-search"), {
          recursive: true,
        });
      await mkdir(join(root, "src"));
      await writeFile(
        join(root, "src/source.ts"),
        "export const worktree = 1;\n",
      );
      const event = searchObservationFixture({
        consumer: "cli",
        sourceVersion: "a".repeat(64),
      });
      expect(enqueueSearchObservation(root, event)).toBe(true);
      bridge = await createRepositoryRunAccess({
        root,
        runID: "cli-worktree-run",
        consumer: "execution",
        search: {
          enabled: true,
          mode: "direct",
          model: "",
          developerInstructions: false,
        },
        signal: new AbortController().signal,
        observationStore: store,
        handoffRoot: owner,
      });
      await bridge!.close();
      expect(readSearchObservationSpool(root).rows).toHaveLength(0);
      expect(readSearchObservationSpool(owner).rows).toHaveLength(1);
      await rm(root, { recursive: true, force: true });
      available = true;
      restarted = new LocalSearchObservationCollector(owner, store, () => {});
      await restarted.flush();
      expect(events).toEqual([
        { ...event, consumer: "execution", runID: "cli-worktree-run" },
      ]);
      expect(readSearchObservationSpool(owner).rows).toHaveLength(0);
    } finally {
      await bridge?.close();
      await restarted?.close();
      await rm(root, { recursive: true, force: true });
      await rm(owner, { recursive: true, force: true });
    }
  });
  it.each(["execution", "review"] as const)(
    "доставляет измерения %s из собственного workspace после восстановления хранилища",
    async (consumer) => {
      const root = await mkdtemp(
        join(tmpdir(), `realize-${consumer}-worktree-`),
      );
      const client = new Client({
        name: "worktree-consumer-test",
        version: "1.0.0",
      });
      const delivered: SearchObservation[] = [];
      let available = false;
      let bridge;
      const collector = new SearchObservationCollector(
        {
          append: async (events) => {
            if (!available) throw Error("fixture_storage_offline");
            delivered.push(...events);
            return events.length;
          },
          control: { maintain: async () => ({ revision: 1, cleaned: false }) },
        },
        () => {},
      );
      try {
        await mkdir(join(root, "src"));
        await writeFile(
          join(root, "src/untracked.ts"),
          "export const isolatedWorktreeValue = 7;\n",
        );
        bridge = await createRepositoryRunAccess({
          root,
          consumer,
          runID: `worktree-${consumer}-1`,
          search: {
            enabled: true,
            mode: "direct",
            model: "",
            developerInstructions: false,
          },
          signal: new AbortController().signal,
          observe: collector.record,
        });
        await client.connect(
          new StreamableHTTPClientTransport(new URL(bridge!.url), {
            requestInit: {
              headers: {
                authorization: `Bearer ${bridge!.environment.REALIZE_CODEX_REPO_BRIDGE_AUTH}`,
              },
            },
          }),
        );
        const result = await client.callTool({
          name: "repo_search",
          arguments: {
            path: "src/untracked.ts",
            query: "isolatedWorktreeValue",
            intent: "definitions",
            limit: 2,
          },
        });
        const match = (
          result.structuredContent as {
            data: {
              matches: {
                path: string;
                line: number;
                fileSha256: string;
                sourceUrl?: string;
              }[];
            };
          }
        ).data.matches[0];
        expect(match.path).toBe("src/untracked.ts");
        expect(match.sourceUrl).toBeUndefined();
        const read = await client.callTool({
          name: "repo_read_file",
          arguments: {
            path: match.path,
            startLine: match.line,
            lineCount: 1,
            expectedSha256: match.fileSha256,
          },
        });
        expect(read.structuredContent).toMatchObject({
          ok: true,
          data: { text: "export const isolatedWorktreeValue = 7;\n" },
        });
        await collector.flush();
        expect(collector.snapshot()).toMatchObject({
          queued: 2,
          errorCode: "delivery_unavailable",
        });
        available = true;
        await collector.flush(true);
        expect(collector.snapshot()).toMatchObject({
          queued: 0,
          errorCode: null,
        });
        expect(delivered.map((e) => e.tool)).toEqual([
          "repo_search",
          "repo_read_file",
        ]);
        expect(
          delivered.every(
            (e) =>
              e.consumer === consumer &&
              e.runID === `worktree-${consumer}-1` &&
              e.bytesRead! > 0,
          ),
        ).toBe(true);
        expect(JSON.stringify(delivered)).not.toContain(root);
        expect(JSON.stringify(delivered)).not.toContain(
          "isolatedWorktreeValue",
        );
      } finally {
        await client.close();
        await bridge?.close();
        await collector.close();
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it("передаёт настоящие данные в text и structuredContent, сохраняя scope, hash и token lifetime", async () => {
    const root = await mkdtemp(join(tmpdir(), "realize-native-mcp-"));
    const controller = new AbortController();
    const client = new Client({ name: "native-bridge-test", version: "1.0.0" });
    let bridge;
    try {
      await mkdir(join(root, "src"));
      await writeFile(
        join(root, "src/current.ts"),
        "export const currentValue = 42;\n",
      );
      const fixture = await createRepositoryGitHeadFixture(root);
      const head = await fixture.commit("src/current.ts");
      const observations: SearchObservation[] = [];
      bridge = await createRepositoryMcpBridge(
        createRepositoryChatTools({
          policy: await createRepositoryReadPolicy(root, false),
          run: { id: "native-bridge-test", cancelRequested: false },
          signal: controller.signal,
          responseBytes: 56 * 1024,
          observe: (event) => observations.push(event),
        }),
        "native-bridge-test",
        controller.signal,
      );
      const credential = bridge.environment.REALIZE_CODEX_REPO_BRIDGE_AUTH!;
      await client.connect(
        new StreamableHTTPClientTransport(new URL(bridge.url), {
          requestInit: { headers: { authorization: `Bearer ${credential}` } },
        }),
      );
      expect(
        (await client.listTools()).tools.map((tool) => tool.name).sort(),
      ).toEqual([
        "repo_git_head",
        "repo_list_files",
        "repo_read_file",
        "repo_search",
      ]);
      const gitHead = await client.callTool({
        name: "repo_git_head",
        arguments: {},
      });
      expect(gitHead.isError).not.toBe(true);
      expect(gitHead.structuredContent).toEqual({
        schemaVersion: "1.0",
        observedAt: expect.any(String),
        requestID: expect.any(String),
        ok: true,
        data: { head, branch: "main", detached: false, unborn: false },
      });
      expect(JSON.parse((gitHead.content[0] as { text: string }).text)).toEqual(
        gitHead.structuredContent,
      );
      const invalidHead = await client.callTool({
        name: "repo_git_head",
        arguments: { root: "/" },
      });
      expect(invalidHead.isError).toBe(true);
      // Strict schema отклоняет extra fields в SDK до исполнения adapter callback.
      expect(invalidHead.structuredContent).toBeUndefined();
      expect((invalidHead.content[0] as { text: string }).text).toContain(
        "Invalid arguments for tool repo_git_head",
      );
      expect(observations).toEqual([]);
      const result = await client.callTool({
        name: "repo_search",
        arguments: {
          path: "src/current.ts",
          query: "currentValue",
          intent: "definitions",
          limit: 1,
        },
      });
      expect(result.isError).not.toBe(true);
      const data = (
        result.structuredContent as {
          data: {
            matches: {
              path: string;
              line: number;
              fileSha256: string;
              sourceUrl: string;
            }[];
          };
        }
      ).data;
      expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(
        result.structuredContent,
      );
      const match = data.matches[0];
      const read = await client.callTool({
        name: "repo_read_file",
        arguments: {
          path: match.path,
          startLine: match.line,
          lineCount: 1,
          expectedSha256: match.fileSha256,
        },
      });
      expect(read.isError).not.toBe(true);
      expect(read.structuredContent).toMatchObject({
        ok: true,
        data: {
          text: "export const currentValue = 42;\n",
          sourceUrl: expect.stringContaining("expectedSha256="),
        },
      });
      expect(
        JSON.parse((read.content[0] as { text: string }).text),
      ).toMatchObject({ data: { text: "export const currentValue = 42;\n" } });
      const denied = await client.callTool({
        name: "repo_read_file",
        arguments: { path: "../private" },
      });
      expect(denied.structuredContent).toMatchObject({
        ok: false,
        error: { code: "INVALID_INPUT" },
      });
      controller.abort();
      expect(
        (
          await fetch(bridge.url, {
            method: "POST",
            headers: { authorization: `Bearer ${credential}` },
            body: "{}",
          })
        ).status,
      ).toBe(401);
    } finally {
      await client.close();
      await bridge?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
