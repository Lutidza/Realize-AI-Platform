/**
 * @file tests/int/repositoryChatTools.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Проверяет actual-files Admin поиск, права, текущие hashes, бюджеты и привязку telemetry к run.
 * @see documentation/architecture/repository-search.md
 */
// @vitest-environment node
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  searchObservationSchema,
  type SearchObservation,
} from "@realize/ai-contracts";
import { createRepositoryReadPolicy } from "../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { createRepositoryChatTools } from "../../services/ai-control-plane/src/repositoryChatTools.adapter";

describe("Admin actual-files repository tools", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-admin-search-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/current.ts"), "export const needle = 1;\n");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const setup = async (id = "admin-run-1", developerInstructions = false) => {
    const events: SearchObservation[] = [];
    const run = { id, cancelRequested: false };
    const tools = createRepositoryChatTools({
      policy: await createRepositoryReadPolicy(root, developerInstructions),
      run,
      observe: (event) => events.push(event),
    });
    const call = (name: string, args: unknown) =>
      tools.execute({
        name,
        arguments: args,
        callID: `fixture-${events.length}`,
      }) as Promise<{
        ok: boolean;
        data: Record<string, any>;
        error?: { code: string; message: string };
      }>;
    return { call, run, events, tools };
  };
  it("находит реальные файлы без Git checkout, читает актуальные строки и даёт проверяемую ссылку", async () => {
    const test = await setup();
    const result = await test.call("repo_search", {
      path: "src",
      query: "needle",
      intent: "definitions",
    });
    expect(result.ok).toBe(true);
    expect(result.data.matches).toHaveLength(1);
    const match = result.data.matches[0];
    expect(match.path).toBe("src/current.ts");
    const link = new URL(match.sourceUrl, "https://example.invalid");
    expect(link.pathname).toBe("/api/realize-ai/chat/project-file");
    expect(link.searchParams.get("path")).toBe(match.path);
    expect(link.searchParams.get("expectedSha256")).toBe(match.fileSha256);
    const read = await test.call("repo_read_file", {
      path: match.path,
      startLine: match.line,
      lineCount: 1,
      expectedSha256: match.fileSha256,
    });
    expect(read.ok).toBe(true);
    expect(read.data.text).toContain("needle = 1");
    expect(test.events).toHaveLength(2);
    for (const event of test.events) {
      expect(searchObservationSchema.safeParse(event).success).toBe(true);
      expect(event).toMatchObject({
        consumer: "admin",
        runID: "admin-run-1",
        outcome: "complete",
      });
      expect(JSON.stringify(event)).not.toContain("needle");
      expect(JSON.stringify(event)).not.toContain(root);
    }
    expect(test.events[1]).toMatchObject({
      tool: "repo_read_file",
      filesRead: 1,
      bytesRead: Buffer.byteLength("export const needle = 1;\n"),
    });
    await writeFile(join(root, "src/current.ts"), "export const needle = 2;\n");
    expect(
      (
        await test.call("repo_read_file", {
          path: match.path,
          expectedSha256: match.fileSha256,
        })
      ).error?.code,
    ).toBe("CONFLICT");
    const updated = await test.call("repo_search", {
      path: "src/current.ts",
      query: "needle",
    });
    expect(updated.data.matches[0].fileSha256).not.toBe(match.fileSha256);
  });
  it("не допускает обход всего проекта и root/control options, разрешает начальную карту каталогов", async () => {
    const test = await setup();
    expect(
      (await test.call("repo_search", { query: "needle" })).error?.code,
    ).toBe("INVALID_INPUT");
    expect(
      (
        await test.call("repo_search", {
          query: "needle",
          path: "src",
          root: "/",
        })
      ).error?.code,
    ).toBe("INVALID_INPUT");
    expect((await test.call("repo_list_files", { depth: 5 })).error?.code).toBe(
      "INVALID_INPUT",
    );
    expect(
      (await test.call("repo_list_files", {})).data.entries,
    ).toContainEqual({ path: "src", type: "directory", size: null });
  });
  it("закрывает traversal, secrets, symlinks и developer instructions без допуска", async () => {
    await writeFile(join(root, "AGENTS.md"), "untrusted instruction");
    await writeFile(join(root, ".env"), "fixture-private-value");
    await symlink(join(root, ".env"), join(root, "src/alias.ts"));
    const test = await setup();
    for (const path of ["../outside", ".env", "src/alias.ts", "AGENTS.md"]) {
      const result = await test.call("repo_read_file", { path });
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("fixture-private-value");
      expect(JSON.stringify(result)).not.toContain(root);
    }
    expect(
      (
        await (
          await setup("manager-run", true)
        ).call("repo_read_file", { path: "AGENTS.md" })
      ).data.text,
    ).toBe("untrusted instruction");
  });
  it("связывает продолжение с run, показывает partial и прекращает поиск по отмене", async () => {
    await writeFile(join(root, "src/other.ts"), "needle\n");
    const test = await setup();
    const first = await test.call("repo_search", {
      query: "needle",
      path: "src",
      limit: 1,
    });
    expect(first.data.truncated).toBe(true);
    expect(test.events[0]).toMatchObject({
      outcome: "partial",
      reason: "page_limit",
    });
    expect(
      (
        await (
          await setup("other-run")
        ).call("repo_search", {
          query: "needle",
          path: "src",
          limit: 1,
          cursor: first.data.nextCursor,
        })
      ).error?.code,
    ).toBe("INVALID_CURSOR");
    test.run.cancelRequested = true;
    expect(
      (await test.call("repo_read_file", { path: "src/current.ts" })).ok,
    ).toBe(false);
    expect(test.events.at(-1)).toMatchObject({
      outcome: "cancelled",
      reason: "cancelled",
    });
  });
});
