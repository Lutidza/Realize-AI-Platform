/**
 * @file tests/int/mcp-git-head.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-21
 * @description Проверяет привязку Git HEAD к descriptor корня, согласованность пары и общий deadline.
 * @see documentation/specifications/internal-mcp.md
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Git } from "../../.ai/tools/git-delivery/src/Git.adapter";
import { readGitHead } from "../../.ai/tools/git-delivery/src/read/readGitHead.adapter";
import type { GitReadContext } from "../../.ai/tools/git-delivery/src/read/GitRead.types";
import { RepositoryCursorService } from "../../services/ai-control-plane/src/RepositoryCursor.service";
import { createRepositoryReadPolicy } from "../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import * as directoryReader from "../../services/ai-control-plane/src/openRepositoryDirectory.adapter";
import * as fileReader from "../../services/ai-control-plane/src/readRepositoryFile.service";

describe("Git HEAD: привязанный корень и согласованные metadata", () => {
  let root: string;
  let git: Git;
  let context: GitReadContext;
  let opened: number;
  let closed: number;
  const identity = {
    GIT_AUTHOR_NAME: "Fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  };
  const commit = async () => {
    await git.run(["add", "--", "src/a.ts"]);
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
      { env: identity },
    );
  };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-git-head-"));
    await mkdir(join(root, "src"));
    git = new Git(root);
    await git.run(["init", "--initial-branch=main"]);
    context = {
      policy: await createRepositoryReadPolicy(root, true),
      principal: "git-head-fixture",
      cursors: new RepositoryCursorService(),
    };
    opened = 0;
    closed = 0;
    const originalOpen = directoryReader.openRepositoryDirectory;
    vi.spyOn(directoryReader, "openRepositoryDirectory").mockImplementation(
      async (...args) => {
        const directory = await originalOpen(...args);
        opened++;
        let released = false;
        return {
          ...directory,
          close: async () => {
            expect(released).toBe(false);
            released = true;
            try {
              await directory.close();
            } finally {
              closed++;
            }
          },
        };
      },
    );
  });
  afterEach(async () => {
    expect(closed).toBe(opened);
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
    await rm(`${root}-held`, { recursive: true, force: true });
  });

  it("запускает настоящий Git через descriptor родителя без индекса, дерева и content reads", async () => {
    await writeFile(join(root, "src/a.ts"), "initial");
    await commit();
    const head = (await git.run(["rev-parse", "HEAD"])).trim();
    await writeFile(join(root, ".git/index"), "broken index");
    await writeFile(join(root, "src/a.ts"), Buffer.alloc(3 * 1024 * 1024, "x"));
    const read = vi.spyOn(fileReader, "readRepositoryFile");
    const originalRun = Git.prototype.run;
    const calls: string[][] = [];
    vi.spyOn(Git.prototype, "run").mockImplementation(async function (
      this: Git,
      args,
      options,
    ) {
      expect(this.root).toMatch(new RegExp(`^/proc/${process.pid}/fd/\\d+$`));
      expect(options?.machineRead).toBe(true);
      calls.push(args);
      return originalRun.call(this, args, options);
    });
    expect(await readGitHead(context)).toEqual({
      head,
      branch: "main",
      detached: false,
      unborn: false,
    });
    expect(calls).toEqual([
      ["rev-parse", "--show-toplevel"],
      ["rev-parse", "--verify", "--quiet", "HEAD"],
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      ["rev-parse", "--verify", "--quiet", "HEAD"],
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
    ]);
    expect(read).not.toHaveBeenCalled();
    expect(opened).toBe(1);
    expect(closed).toBe(1);
  });

  it("различает unborn и detached без неявной записи refs", async () => {
    expect(await readGitHead(context)).toEqual({
      head: null,
      branch: "main",
      detached: false,
      unborn: true,
    });
    await writeFile(join(root, "src/a.ts"), "initial");
    await commit();
    const head = (await git.run(["rev-parse", "HEAD"])).trim();
    await git.run(["checkout", "--detach", "HEAD"]);
    expect(await readGitHead(context)).toEqual({
      head,
      branch: null,
      detached: true,
      unborn: false,
    });
  });

  it("не выдаёт metadata подменённого корня и закрывает descriptor при гонке", async () => {
    await writeFile(join(root, "src/a.ts"), "original");
    await commit();
    const originalRun = Git.prototype.run;
    let replaced = false;
    vi.spyOn(Git.prototype, "run").mockImplementation(async function (
      this: Git,
      args,
      options,
    ) {
      if (options?.machineRead && args.includes("--verify") && !replaced) {
        replaced = true;
        await rename(root, `${root}-held`);
        await mkdir(root);
        await new Git(root).run(["init", "--initial-branch=foreign"]);
      }
      return originalRun.call(this, args, options);
    });
    await expect(readGitHead(context)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(replaced).toBe(true);
    expect(closed).toBe(1);
  });

  it("отказывает заменённому корню до первой команды Git", async () => {
    await rename(root, `${root}-held`);
    await mkdir(root);
    await new Git(root).run(["init", "--initial-branch=foreign"]);
    const run = vi.spyOn(Git.prototype, "run");
    await expect(readGitHead(context)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("отвергает смешанную пару при переключении ветки между HEAD и symbolic-ref", async () => {
    await writeFile(join(root, "src/a.ts"), "main");
    await commit();
    await git.run(["checkout", "-b", "other"]);
    await writeFile(join(root, "src/a.ts"), "other");
    await commit();
    await git.run(["checkout", "main"]);
    const originalRun = Git.prototype.run;
    let switched = false;
    vi.spyOn(Git.prototype, "run").mockImplementation(async function (
      this: Git,
      args,
      options,
    ) {
      if (options?.machineRead && args[0] === "symbolic-ref" && !switched) {
        switched = true;
        await git.run(["checkout", "other"]);
      }
      return originalRun.call(this, args, options);
    });
    await expect(readGitHead(context)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(switched).toBe(true);
    expect(closed).toBe(1);
  });

  it("ограничивает всю последовательность единым deadline и освобождает descriptor", async () => {
    const originalRun = Git.prototype.run;
    const signals = new Set<AbortSignal>();
    vi.spyOn(Git.prototype, "run").mockImplementation(async function (
      this: Git,
      args,
      options,
    ) {
      expect(options?.signal).toBeDefined();
      signals.add(options!.signal!);
      await delay(600, undefined, { signal: options!.signal });
      return originalRun.call(this, args, options);
    });
    const started = performance.now();
    await expect(readGitHead(context)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(signals.size).toBe(1);
    expect([...signals][0].aborted).toBe(true);
    expect(performance.now() - started).toBeLessThan(4000);
    expect(closed).toBe(1);
  }, 6000);

  it("не открывает корень при уже отменённом запросе", async () => {
    const run = vi.spyOn(Git.prototype, "run");
    await expect(
      readGitHead({ ...context, signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(opened).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
});
