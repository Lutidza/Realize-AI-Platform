/**
 * @file tests/int/repositoryChatTools.int.spec.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Проверяет actual-files Admin поиск и Git HEAD с общими бюджетами, отменой и отдельной search telemetry.
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
import { createRepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { createRepositoryChatTools } from "../../services/ai-control-plane/src/repositoryChatTools.adapter";
import type { RepositoryChatToolsOptions } from "../../services/ai-control-plane/src/RepositoryChatTools.types";
import { createRepositoryGitHeadFixture } from "./fixtures/repositoryGitHead.fixture";

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
  const setup = async (
    id = "admin-run-1",
    developerInstructions = false,
    options: Pick<RepositoryChatToolsOptions, "signal" | "responseBytes"> = {},
  ) => {
    const events: SearchObservation[] = [];
    const run = { id, cancelRequested: false };
    const tools = createRepositoryChatTools({
      ...options,
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
  it("читает unborn, branch и detached HEAD actual repository без search telemetry", async () => {
    const fixture = await createRepositoryGitHeadFixture(root);
    const test = await setup();
    expect(test.tools.definitions.map(({ name }) => name).sort()).toEqual([
      "repo_git_head",
      "repo_list_files",
      "repo_read_file",
      "repo_search",
    ]);
    expect(await test.call("repo_git_head", {})).toEqual({
      ok: true,
      data: { head: null, branch: "main", detached: false, unborn: true },
    });
    const head = await fixture.commit("src/current.ts");
    await writeFile(join(root, "src/untracked.ts"), "untracked fixture\n");
    expect(await test.call("repo_git_head", {})).toEqual({
      ok: true,
      data: { head, branch: "main", detached: false, unborn: false },
    });
    await fixture.git.run(["checkout", "--detach", "HEAD"]);
    expect(await test.call("repo_git_head", {})).toEqual({
      ok: true,
      data: { head, branch: null, detached: true, unborn: false },
    });
    expect(test.events).toEqual([]);
  });
  it("отделяет отсутствие Git от доступности файлов и отклоняет любые аргументы HEAD", async () => {
    const test = await setup();
    const failed = await test.call("repo_git_head", {});
    expect(failed).toMatchObject({
      ok: false,
      error: { code: "DEPENDENCY_UNAVAILABLE" },
    });
    expect(JSON.stringify(failed)).not.toContain(root);
    for (const args of [{ path: ".git/HEAD" }, { limit: 5 }, { root }, null]) {
      expect(await test.call("repo_git_head", args)).toMatchObject({
        ok: false,
        error: { code: "INVALID_INPUT" },
      });
    }
    expect(test.events).toEqual([]);
    expect(
      await test.call("repo_read_file", { path: "src/current.ts" }),
    ).toMatchObject({
      ok: true,
      data: { text: "export const needle = 1;\n" },
    });
    expect(test.events).toHaveLength(1);
    expect(test.events[0].tool).toBe("repo_read_file");
  });
  it("делит 16 вызовов между Git и файлами, сохраняя один выполняющийся запрос", async () => {
    await createRepositoryGitHeadFixture(root);
    const test = await setup();
    const pending = test.call("repo_git_head", {});
    expect(await test.call("repo_list_files", {})).toMatchObject({
      ok: false,
      error: { code: "RESULT_LIMIT" },
    });
    expect((await pending).ok).toBe(true);
    for (let index = 2; index < 16; index++) {
      const result =
        index % 2
          ? await test.call("repo_read_file", { path: "src/current.ts" })
          : await test.call("repo_git_head", {});
      expect(result.ok).toBe(true);
    }
    expect(await test.call("repo_git_head", {})).toMatchObject({
      ok: false,
      error: { code: "RESULT_LIMIT" },
    });
    expect(test.events.map((event) => event.tool)).toEqual([
      "repo_list_files",
      ...Array<string>(7).fill("repo_read_file"),
    ]);
  });
  it("учитывает Git HEAD в общем лимите 512 KiB результатов", async () => {
    await createRepositoryGitHeadFixture(root);
    await writeFile(join(root, "src/large.ts"), "x".repeat(110_000));
    const test = await setup();
    let outputBytes = 0;
    let lastRead;
    for (let index = 0; index < 4; index++) {
      lastRead = await test.call("repo_read_file", { path: "src/large.ts" });
      expect(lastRead.ok).toBe(true);
      outputBytes += Buffer.byteLength(JSON.stringify(lastRead));
    }
    // Оставляем 32 bytes после ещё одного чтения: этого недостаточно для HEAD DTO.
    const overhead = Buffer.byteLength(JSON.stringify(lastRead)) - 110_000;
    const remainingText = 512 * 1024 - outputBytes - overhead - 32;
    expect(remainingText).toBeGreaterThan(10_000);
    expect(remainingText).toBeLessThan(100_000);
    await writeFile(join(root, "src/large.ts"), "x".repeat(remainingText));
    const finalRead = await test.call("repo_read_file", {
      path: "src/large.ts",
    });
    expect(finalRead.ok).toBe(true);
    outputBytes += Buffer.byteLength(JSON.stringify(finalRead));
    expect(512 * 1024 - outputBytes).toBeLessThan(64);
    expect(await test.call("repo_git_head", {})).toMatchObject({
      ok: false,
      error: { code: "RESULT_LIMIT" },
    });
    expect(test.events).toHaveLength(5);
  });
  it.each(["run", "signal"] as const)(
    "отменяет Git HEAD через %s и не создаёт search observation",
    async (source) => {
      await createRepositoryGitHeadFixture(root);
      const controller = new AbortController();
      const test = await setup("cancel-git", false, {
        signal: controller.signal,
      });
      const pending = test.call("repo_git_head", {});
      if (source === "run") test.run.cancelRequested = true;
      else controller.abort();
      expect(await pending).toMatchObject({
        ok: false,
        error: { code: "TIMEOUT" },
      });
      expect(test.events).toEqual([]);
    },
  );
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
