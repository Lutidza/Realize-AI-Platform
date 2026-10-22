// @vitest-environment node

/**
 * @file tests/int/source-promotion-github.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Проверяет create-only exact ref publication и idempotent draft Pull Request API.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  Git,
  withGitRepositoryLock,
  type GitRunOptions,
} from "@realize/git-runtime";

import { publishExactGitHubBranch } from "../../services/ai-execution-worker/src/sourcePromotionGit";
import { SourcePromotionGitPolicyError } from "../../services/ai-execution-worker/src/SourcePromotionGitPolicy.error";
import { ensureGitHubDraftPullRequest } from "../../services/ai-execution-worker/src/sourcePromotionGitHub";

const temporaryRoots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0))
    await rm(root, { recursive: true, force: true });
});

const gitCommit = "a".repeat(40);
const headBranch = "ai/changes/42-123456789abc";

describe("GitHub source promotion adapter", () => {
  it("publishes an exact branch through shared HTTPS execution without token in argv or files", async () => {
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "realize-source-git-test-"),
    );
    temporaryRoots.push(repositoryRoot);
    await promisify(execFile)("git", ["init", "--template=", repositoryRoot]);
    const calls: Array<{ args: readonly string[]; options?: GitRunOptions }> =
      [];
    const original = Git.prototype.run;
    let remoteCommit = "";
    let askpassPath = "";
    vi.spyOn(Git.prototype, "run").mockImplementation(async function (
      this: Git,
      args,
      options,
    ) {
      if (args.includes("--git-common-dir"))
        return original.call(this, args, options);
      calls.push({ args, options });
      if (args[0] === "remote") return "git@github.com:realize/example.git\n";
      if (args[0] === "rev-parse") return gitCommit + "\n";
      if (options?.network?.transport === "https") {
        askpassPath = options.network.askpassPath;
        const script = await readFile(askpassPath, "utf8");
        expect(script).not.toContain("source-promotion-secret-token");
        expect(script).toContain("REALIZE_GIT_HTTP_TOKEN");
      }
      if (args.includes("ls-remote"))
        return remoteCommit
          ? remoteCommit + "\trefs/heads/" + headBranch + "\n"
          : "";
      if (args.includes("push")) {
        remoteCommit = gitCommit;
        return "";
      }
      throw new Error("Unexpected fixture Git command.");
    });
    const input = {
      gitCommand: "/usr/bin/git",
      gitCommit,
      headBranch,
      repositoryRoot,
      repositorySlug: "realize/example",
      timeoutMs: 10_000,
      token: "source-promotion-secret-token",
    };
    await publishExactGitHubBranch(input);
    await publishExactGitHubBranch(input);
    const pushes = calls.filter((call) => call.args.includes("push"));
    expect(pushes).toHaveLength(1);
    expect(pushes[0].args).toContain(gitCommit + ":refs/heads/" + headBranch);
    expect(pushes[0].args).not.toContain("--force");
    expect(pushes[0].args).toContain(
      "--force-with-lease=refs/heads/" + headBranch + ":",
    );
    expect(pushes[0].args).toContain("--no-follow-tags");
    expect(pushes[0].args).toContain("--recurse-submodules=no");
    expect(calls.flatMap((call) => call.args).join(" ")).not.toContain(
      input.token,
    );
    expect(pushes[0].options?.network).toMatchObject({
      transport: "https",
      token: input.token,
    });
    expect(pushes[0].options?.signal).toBeInstanceOf(AbortSignal);
    await expect(access(askpassPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses an existing foreign ref before push and releases the common repository lease", async () => {
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "realize-source-git-refusal-"),
    );
    temporaryRoots.push(repositoryRoot);
    await promisify(execFile)("git", ["init", "--template=", repositoryRoot]);
    const original = Git.prototype.run;
    const run = vi
      .spyOn(Git.prototype, "run")
      .mockImplementation(async function (this: Git, args, options) {
        if (args.includes("--git-common-dir"))
          return original.call(this, args, options);
        if (args[0] === "remote")
          return "https://github.com/realize/example.git\n";
        if (args[0] === "rev-parse") return gitCommit + "\n";
        if (args.includes("ls-remote"))
          return "b".repeat(40) + "\trefs/heads/" + headBranch + "\n";
        throw new Error("Unexpected network write.");
      });
    await expect(
      publishExactGitHubBranch({
        gitCommand: "/usr/bin/git",
        gitCommit,
        headBranch,
        repositoryRoot,
        repositorySlug: "realize/example",
        timeoutMs: 10_000,
        token: "fixture-token",
      }),
    ).rejects.toBeInstanceOf(SourcePromotionGitPolicyError);
    expect(run.mock.calls.some(([args]) => args.includes("push"))).toBe(false);
    await expect(
      withGitRepositoryLock({ repositoryRoot }, async () => true),
    ).resolves.toBe(true);
  });

  it("does not fast-forward a concurrently created ancestor ref in a disposable remote", async () => {
    const root = await mkdtemp(join(tmpdir(), "realize-source-git-race-"));
    temporaryRoots.push(root);
    const repositoryRoot = join(root, "repository");
    const remote = join(root, "remote.git");
    await mkdir(repositoryRoot);
    const raw = async (cwd: string, args: string[]) =>
      (
        await promisify(execFile)(
          "/usr/bin/git",
          [
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "commit.gpgsign=false",
            ...args,
          ],
          {
            cwd,
            encoding: "utf8",
            env: {
              ...process.env,
              GIT_AUTHOR_NAME: "Fixture",
              GIT_AUTHOR_EMAIL: "fixture@example.invalid",
              GIT_COMMITTER_NAME: "Fixture",
              GIT_COMMITTER_EMAIL: "fixture@example.invalid",
            },
          },
        )
      ).stdout.trim();
    await raw(root, ["init", "--template=", repositoryRoot]);
    await raw(root, ["init", "--bare", "--template=", remote]);
    await writeFile(join(repositoryRoot, "fixture.txt"), "ancestor\n");
    await raw(repositoryRoot, ["add", "fixture.txt"]);
    await raw(repositoryRoot, ["commit", "-m", "fixture ancestor"]);
    const ancestor = await raw(repositoryRoot, ["rev-parse", "HEAD"]);
    await raw(repositoryRoot, ["push", remote, "HEAD:refs/heads/seed"]);
    await writeFile(join(repositoryRoot, "fixture.txt"), "approved\n");
    await raw(repositoryRoot, ["add", "fixture.txt"]);
    await raw(repositoryRoot, ["commit", "-m", "fixture approved"]);
    const approved = await raw(repositoryRoot, ["rev-parse", "HEAD"]);
    await raw(repositoryRoot, [
      "remote",
      "add",
      "origin",
      "https://github.com/realize/example.git",
    ]);
    const reference = "refs/heads/" + headBranch;
    const executable = join(root, "fixture-git.cjs");
    const trace = join(root, "calls.jsonl");
    const raced = join(root, "race-created");
    // Исполнитель fixture перенаправляет только заданный URL в local bare repository; сеть не используется.
    await writeFile(
      executable,
      [
        "#!" + process.execPath,
        'const { spawnSync } = require("node:child_process");',
        'const { appendFileSync, existsSync, writeFileSync } = require("node:fs");',
        "const args = process.argv.slice(2);",
        "const remote = " + JSON.stringify(remote) + ";",
        "const trace = " + JSON.stringify(trace) + ";",
        "const marker = " + JSON.stringify(raced) + ";",
        'const index = args.indexOf("https://github.com/realize/example.git");',
        "if (index >= 0) args[index] = remote;",
        'appendFileSync(trace, JSON.stringify(args) + "\\n");',
        'const env = { ...process.env, GIT_ALLOW_PROTOCOL: "file" };',
        'const result = spawnSync("/usr/bin/git", args, { env, encoding: "utf8" });',
        'if (args.includes("ls-remote") && !existsSync(marker) && !result.stdout.trim()) {',
        '  const race = spawnSync("/usr/bin/git", ' +
          JSON.stringify([
            "--git-dir=" + remote,
            "update-ref",
            reference,
            ancestor,
          ]) +
          ", { env });",
        "  if (race.status !== 0) process.exit(91);",
        '  writeFileSync(marker, "created");',
        "}",
        'process.stdout.write(result.stdout || "");',
        'process.stderr.write(result.stderr || "");',
        "process.exit(result.status ?? 92);",
      ].join("\n"),
      { mode: 0o700 },
    );

    await expect(
      publishExactGitHubBranch({
        gitCommand: executable,
        gitCommit: approved,
        headBranch,
        repositoryRoot,
        repositorySlug: "realize/example",
        timeoutMs: 20_000,
        token: "fixture-race-token",
      }),
    ).rejects.toThrow();

    expect(
      await raw(repositoryRoot, [
        "--git-dir=" + remote,
        "rev-parse",
        reference,
      ]),
    ).toBe(ancestor);
    const calls = (await readFile(trace, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    const pushes = calls.filter((args) => args.includes("push"));
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toContain("--force-with-lease=" + reference + ":");
    expect(pushes[0]).toContain(approved + ":" + reference);
    expect(await readFile(trace, "utf8")).not.toContain("fixture-race-token");
  }, 30_000);

  it("creates a draft PR once and validates its exact head SHA", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            base: { ref: "main" },
            draft: true,
            head: { ref: headBranch, sha: gitCommit },
            html_url: "https://github.com/realize/example/pull/17",
            number: 17,
            state: "open",
          }),
          { headers: { "Content-Type": "application/json" }, status: 201 },
        ),
      ) as unknown as typeof fetch;

    await expect(
      ensureGitHubDraftPullRequest(
        {
          baseBranch: "main",
          body: "Bound evidence",
          gitCommit,
          headBranch,
          repositorySlug: "realize/example",
          timeoutMs: 10_000,
          title: "chore(ai): verified change",
          token: "source-promotion-secret-token",
        },
        fetchImplementation,
      ),
    ).resolves.toEqual({
      draft: true,
      number: 17,
      state: "open",
      url: "https://github.com/realize/example/pull/17",
    });

    const post = vi.mocked(fetchImplementation).mock.calls[1];
    expect(post?.[0]).toBe(
      "https://api.github.com/repos/realize/example/pulls",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      base: "main",
      draft: true,
      head: headBranch,
      maintainer_can_modify: false,
    });
  });

  it("blocks an existing exact PR that is no longer an open draft", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            base: { ref: "main" },
            draft: false,
            head: { ref: headBranch, sha: gitCommit },
            html_url: "https://github.com/realize/example/pull/17",
            number: 17,
            state: "open",
          },
        ]),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    ) as unknown as typeof fetch;

    await expect(
      ensureGitHubDraftPullRequest(
        {
          baseBranch: "main",
          body: "Bound evidence",
          gitCommit,
          headBranch,
          repositorySlug: "realize/example",
          timeoutMs: 10_000,
          title: "chore(ai): verified change",
          token: "source-promotion-secret-token",
        },
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ blocked: true });
  });
});
