/**
 * @file tests/int/mcp-git-read-performance.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-20
 * @description Проверяет ограниченное параллельное чтение Git, неизменность snapshot и защиту обхода.
 * @see documentation/specifications/internal-mcp.md
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdir,
  mkdtemp,
  link,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Git } from "../../.ai/tools/git-delivery/src/Git.adapter";
import { readGitStatus } from "../../.ai/tools/git-delivery/src/read/readGitStatus.service";
import { RepositoryCursorService } from "../../services/ai-control-plane/src/RepositoryCursor.service";
import { RepositoryReadError } from "../../services/ai-control-plane/src/RepositoryRead.error";
import type { RepositoryQueryContext } from "../../services/ai-control-plane/src/RepositoryQueries.types";
import { createRepositoryReadPolicy } from "../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import * as fileReader from "../../services/ai-control-plane/src/readRepositoryFile.service";
import * as directoryReader from "../../services/ai-control-plane/src/openRepositoryDirectory.adapter";
import { walkRepository } from "../../services/ai-control-plane/src/walkRepository.service";

describe("Git MCP: bounded snapshot без изменения политики", () => {
  let root: string;
  let context: RepositoryQueryContext;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-mcp-git-performance-"));
    await mkdir(join(root, "src"));
    const git = new Git(root);
    await git.run(["init", "--initial-branch=main"]);
    await writeFile(join(root, "src/base.ts"), "base\n");
    await git.run(["add", "--", "src/base.ts"]);
    await git.run(
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "fixture",
      ],
      {
        env: {
          GIT_AUTHOR_NAME: "Fixture",
          GIT_AUTHOR_EMAIL: "fixture@example.invalid",
          GIT_COMMITTER_NAME: "Fixture",
          GIT_COMMITTER_EMAIL: "fixture@example.invalid",
        },
      },
    );
    context = {
      policy: await createRepositoryReadPolicy(root, true),
      principal: "git-performance-fixture",
      cursors: new RepositoryCursorService(),
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("завершает большой checkout в RPC budget, читая ограниченное число файлов одновременно", async () => {
    const paths: string[] = [];
    for (let group = 0; group < 24; group++) {
      const directory = `src/group-${group}/nested/deep`;
      await mkdir(join(root, directory), { recursive: true });
      const batch = Array.from(
        { length: 64 },
        (_, index) => `${directory}/file-${index}.ts`,
      );
      paths.push(...batch);
      await Promise.all(
        batch.map((path) =>
          writeFile(join(root, path), `export const n = 1;\n`),
        ),
      );
    }
    let active = 0;
    let maximumActive = 0;
    const originalRead = fileReader.readRepositoryFile;
    vi.spyOn(fileReader, "readRepositoryFile").mockImplementation(
      async (...args) => {
        active++;
        maximumActive = Math.max(maximumActive, active);
        try {
          return await originalRead(...args);
        } finally {
          active--;
        }
      },
    );
    const opens = vi.spyOn(directoryReader, "openRepositoryDirectory");
    const indexBefore = await readFile(join(root, ".git/index"));
    const first = await readGitStatus(
      { ...context, signal: AbortSignal.timeout(10000) },
      { limit: 5 },
    );
    expect(first.entries.map((entry) => entry.path)).toEqual(
      paths.sort().slice(0, 5),
    );
    expect(first.truncated).toBe(true);
    expect(first.truncationReason).toBe("page_limit");
    expect(fileReader.readRepositoryFile).toHaveBeenCalledTimes(
      paths.length + 1,
    );
    expect(maximumActive).toBeGreaterThan(1);
    expect(maximumActive).toBeLessThanOrEqual(8);
    expect(active).toBe(0);
    // Один parent на content read; обход открывает каталоги, а не цепочку заново на каждый файл.
    expect(opens.mock.calls.length).toBeLessThan(paths.length + 200);
    expect(await readFile(join(root, ".git/index"))).toEqual(indexBefore);
  }, 20000);

  it("отвергает cursor после изменения bytes при прежних status, размере и mtime", async () => {
    await writeFile(join(root, "src/a.ts"), "aaaa");
    await writeFile(join(root, "src/b.ts"), "bbbb");
    const first = await readGitStatus(context, { limit: 1 });
    expect(first.nextCursor).toBeTruthy();
    const before = await stat(join(root, "src/b.ts"));
    await writeFile(join(root, "src/b.ts"), "cccc");
    await utimes(join(root, "src/b.ts"), before.atime, before.mtime);
    const current = await readGitStatus(context, { limit: 100 });
    expect(
      current.entries.map((entry) => [entry.path, entry.worktreeStatus]),
    ).toEqual([
      ["src/a.ts", "?"],
      ["src/b.ts", "?"],
    ]);
    expect(current.snapshotHash).not.toBe(first.snapshotHash);
    await expect(
      readGitStatus(context, { limit: 1, cursor: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("после отказа прекращает новые чтения и дожидается cleanup активных", async () => {
    await Promise.all(
      Array.from({ length: 32 }, (_, index) =>
        writeFile(
          join(root, `src/a-${String(index).padStart(2, "0")}.ts`),
          "a",
        ),
      ),
    );
    const originalRead = fileReader.readRepositoryFile;
    let active = 0;
    let started = 0;
    vi.spyOn(fileReader, "readRepositoryFile").mockImplementation(
      async (policy, path, options) => {
        active++;
        started++;
        try {
          if (path === "src/a-00.ts")
            throw new RepositoryReadError("CONFLICT", "Fixture race.");
          await delay(15);
          return await originalRead(policy, path, options);
        } finally {
          active--;
        }
      },
    );
    await expect(readGitStatus(context, { limit: 1 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(active).toBe(0);
    expect(started).toBeLessThanOrEqual(8);
    expect(started).toBeGreaterThan(1);
  });

  it("соблюдает общий byte budget для параллельных файлов", async () => {
    const content = Buffer.alloc(2 * 1024 * 1024, "a");
    for (let index = 0; index < 26; index++)
      await writeFile(join(root, `src/large-${index}.ts`), content);
    await expect(readGitStatus(context, { limit: 1 })).rejects.toMatchObject({
      code: "RESULT_LIMIT",
    });
  }, 15000);

  it("сохраняет фильтрацию секретов, ссылок и вложенных checkout без запуска clean filters", async () => {
    const git = new Git(root);
    await writeFile(join(root, "src/.gitattributes"), "*.ts filter=fixture\n");
    await git.run([
      "config",
      "filter.fixture.clean",
      "touch forbidden-executed; cat",
    ]);
    await writeFile(join(root, "src/content.ts"), `ghp_${"X".repeat(36)}`);
    await writeFile(join(root, "src/hard-target.ts"), "safe");
    await link(
      join(root, "src/hard-target.ts"),
      join(root, "src/hard-copy.ts"),
    );
    await symlink(join(root, "src/base.ts"), join(root, "src/link.ts"));
    await mkdir(join(root, "src/nested/.git"), { recursive: true });
    await writeFile(join(root, "src/nested/hidden.ts"), "safe");
    await writeFile(join(root, "src/base.ts"), "changed");
    const result = await readGitStatus(context, { limit: 100 });
    expect(result.entries.map((entry) => entry.path)).toEqual([
      "src/.gitattributes",
      "src/base.ts",
    ]);
    await expect(readFile(join(root, "forbidden-executed"))).rejects.toThrow();
  });

  it("сохраняет DFS budget и обнаруживает замену удерживаемого родителя", async () => {
    await writeFile(join(root, "src/a.ts"), "a");
    await writeFile(join(root, "src/b.ts"), "b");
    const limited = await walkRepository(context.policy, {
      path: "src",
      maxEntries: 2,
    });
    expect(limited.inspectedEntries).toBe(2);
    expect(limited.entries).toHaveLength(1);
    expect(limited.truncated).toBe(true);

    const originalOpen = directoryReader.openRepositoryDirectory;
    let replaced = false;
    let held = 0;
    vi.spyOn(directoryReader, "openRepositoryDirectory").mockImplementation(
      async (policy, path) => {
        const directory = await originalOpen(policy, path);
        held++;
        return {
          ...directory,
          verify: async () => {
            if (path === "src" && !replaced) {
              replaced = true;
              await rename(join(root, "src"), join(root, "moved"));
              await mkdir(join(root, "src"));
              await writeFile(join(root, "src/replacement.ts"), "replacement");
            }
            await directory.verify();
          },
          close: async () => {
            try {
              await directory.close();
            } finally {
              held--;
            }
          },
        };
      },
    );
    await expect(
      walkRepository(context.policy, { path: "src" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(replaced).toBe(true);
    expect(held).toBe(0);
  });

  it("повторно проверяет появившийся .git в удерживаемом предке", async () => {
    await mkdir(join(root, "src/nested/deep"), { recursive: true });
    await writeFile(join(root, "src/nested/deep/code.ts"), "hidden");
    const originalOpen = directoryReader.openRepositoryDirectory;
    vi.spyOn(directoryReader, "openRepositoryDirectory").mockImplementation(
      async (policy, path) => {
        const directory = await originalOpen(policy, path);
        if (path === "src/nested/deep") await mkdir(join(root, "src/.git"));
        return directory;
      },
    );
    const result = await walkRepository(context.policy, { path: "src" });
    expect(result.entries.some((entry) => entry.path.endsWith("code.ts"))).toBe(
      false,
    );
  });
});
