/**
 * @file tests/int/mcp-repository.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Проверяет безопасное чтение, Unicode, snapshots и курсоры на временной файловой системе.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, link, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRepositoryReadPolicy } from "../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { readRepositoryFile } from "../../services/ai-control-plane/src/readRepositoryFile.service";
import { readRepositoryLines } from "../../services/ai-control-plane/src/readRepositoryLines.service";
import { listRepositoryFiles } from "../../services/ai-control-plane/src/listRepositoryFiles.service";
import { searchRepository } from "../../services/ai-control-plane/src/searchRepository.service";
import { RepositoryCursorService } from "../../services/ai-control-plane/src/RepositoryCursor.service";
import type { RepositoryQueryContext } from "../../services/ai-control-plane/src/RepositoryQueries.types";
import { mcpToolInputs } from "../../packages/ai-contracts/src/mcpToolInputs.config";

describe("Repository MCP: реальные bytes и границы", () => {
  let root: string;
  let context: RepositoryQueryContext;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-mcp-read-"));
    await mkdir(join(root, "src"));
    context = {
      policy: await createRepositoryReadPolicy(root, true),
      principal: "operator-test",
      cursors: new RepositoryCursorService(),
    };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const read = (path: string, extra: object = {}) =>
    readRepositoryLines(
      context,
      mcpToolInputs.repo_read_file.parse({ path, ...extra }),
    );
  const list = (extra: object = {}) =>
    listRepositoryFiles(
      context,
      mcpToolInputs.repo_list_files.parse({ path: "src", ...extra }),
    );
  const search = (extra: object = {}) =>
    searchRepository(
      context,
      mcpToolInputs.repo_search.parse({
        query: "needle",
        path: "src",
        ...extra,
      }),
    );

  it("сохраняет CRLF и hash полного файла при чтении диапазона", async () => {
    const text = "один\r\nдва\r\nтри";
    await writeFile(join(root, "src/a.ts"), text);
    const result = await read("src/a.ts", { startLine: 2, lineCount: 1 });
    expect(result).toMatchObject({
      text: "два\r\n",
      startLine: 2,
      endLine: 2,
      totalLines: 3,
      nextLine: 3,
    });
    expect(result.version.sha256).toBe(
      createHash("sha256").update(text).digest("hex"),
    );
    await writeFile(join(root, "src/a.ts"), "changed");
    await expect(
      read("src/a.ts", { expectedSha256: result.version.sha256 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("обрабатывает пустой файл, EOF и слишком длинную строку", async () => {
    await writeFile(join(root, "src/a.ts"), "");
    expect(await read("src/a.ts")).toMatchObject({
      text: "",
      totalLines: 0,
      startLine: 1,
      endLine: 0,
      nextLine: null,
    });
    await writeFile(join(root, "src/a.ts"), "one\n");
    expect(await read("src/a.ts")).toMatchObject({
      totalLines: 1,
      nextLine: null,
    });
    await expect(read("src/a.ts", { startLine: 2 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await writeFile(join(root, "src/a.ts"), "я".repeat(70000));
    await expect(read("src/a.ts")).rejects.toMatchObject({
      code: "RESULT_LIMIT",
    });
  });
  it.each([
    "../private",
    "/etc/passwd",
    "C:/private",
    "\\\\server\\share",
    "src/../README.md",
    "src/a\u0000.ts",
  ])("отказывает некорректному пути %s", async (path) => {
    await expect(read(path)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("не открывает symlinks, hardlinks, вложенные checkout и runtime", async () => {
    await writeFile(join(root, "src/safe.ts"), "needle");
    await symlink(join(root, "src/safe.ts"), join(root, "src/link.ts"));
    await link(join(root, "src/safe.ts"), join(root, "src/hard.ts"));
    await mkdir(join(root, "src/nested/.git"), { recursive: true });
    await writeFile(join(root, "src/nested/code.ts"), "needle");
    await symlink(join(root, "src/nested"), join(root, "src/alias"));
    for (const path of [
      "src/link.ts",
      "src/hard.ts",
      "src/nested/code.ts",
      "src/alias/code.ts",
      ".ai/tools/agent-runtime/runtime/state.json",
      ".env",
      "src/payload-types.ts",
    ]) {
      await expect(read(path)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect((await list({ depth: 5 })).entries).toEqual([]);
    expect((await search()).matches).toEqual([]);
  });
  it("закрывает бинарный, невалидный UTF-8 и секреты; не выдаёт их в поиске", async () => {
    await writeFile(join(root, "src/binary.ts"), Buffer.from([0, 1, 2]));
    await writeFile(join(root, "src/invalid.ts"), Buffer.from([0xff]));
    await writeFile(
      join(root, "src/private.ts"),
      `needle ghp_${"X".repeat(36)}`,
    );
    for (const path of ["src/binary.ts", "src/invalid.ts", "src/private.ts"])
      await expect(read(path)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await search()).matches).toEqual([]);
  });
  it("отделяет developer instructions от product policy", async () => {
    await writeFile(join(root, "AGENTS.md"), "instruction");
    const product = await createRepositoryReadPolicy(root, false);
    await expect(
      readRepositoryFile(product, "AGENTS.md"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await read("AGENTS.md")).text).toBe("instruction");
  });
  it("обнаруживает изменение ещё не выданного search candidate", async () => {
    await writeFile(join(root, "src/a.ts"), "needle");
    await writeFile(join(root, "src/b.ts"), "needle");
    const first = await search({ limit: 1 });
    expect(first.nextCursor).toBeTruthy();
    const next = await search({ limit: 1, cursor: first.nextCursor });
    expect(next.matches[0].path).toBe("src/b.ts");
    await writeFile(join(root, "src/b.ts"), "another needle");
    await expect(
      search({ limit: 1, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("связывает курсор с запросом, principal, временем и процессом", async () => {
    await writeFile(join(root, "src/a.ts"), "a");
    await writeFile(join(root, "src/b.ts"), "b");
    const first = await list({ limit: 1 });
    await expect(
      list({ limit: 2, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    const cursors = context.cursors;
    context.principal = "other";
    await expect(
      list({ limit: 1, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    context.principal = "operator-test";
    context.cursors = new RepositoryCursorService();
    await expect(
      list({ limit: 1, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    context.cursors = cursors;
    await expect(
      list({ limit: 1, cursor: `${first.nextCursor}x` }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    let now = 1000;
    context.cursors = new RepositoryCursorService(() => now);
    const expiring = await list({ limit: 1 });
    now += 600001;
    await expect(
      list({ limit: 1, cursor: expiring.nextCursor }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });
  it("считает Unicode code point columns и ищет буквально", async () => {
    await writeFile(join(root, "src/a.ts"), "😀İ needle.* []\n");
    const result = await search({ query: "NEEDLE.* []" });
    expect(result.matches[0]).toMatchObject({
      line: 1,
      column: 4,
      snippet: "😀İ needle.* []",
    });
  });
  it("отменяет чтение и не принимает управляющие поля в input", async () => {
    context.signal = AbortSignal.abort();
    await expect(list()).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(() =>
      mcpToolInputs.repo_read_file.parse({ path: "src/a.ts", root: "/" }),
    ).toThrow();
    expect(() =>
      mcpToolInputs.pages_get_structure.parse({ pageID: "1", offset: 32 }),
    ).toThrow();
  });
});
