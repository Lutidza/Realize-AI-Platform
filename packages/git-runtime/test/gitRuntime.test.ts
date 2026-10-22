/**
 * @file packages/git-runtime/test/gitRuntime.test.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет реальные leases, профили и сетевые границы общего Git owner на disposable fixtures.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { promisify } from "node:util";
import {
  Git,
  GitFailure,
  PolicyError,
  buildCreateOnlyGitPushArguments,
  createGitAskpass,
  requiresGitLock,
  withGitRepositoryLock,
} from "../src/gitRuntime.server.index.ts";
import type { GitLock } from "../src/gitRuntime.server.index.ts";

const execute = promisify(execFile);
const identity = {
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.test",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.test",
};
const errorCode = (expected: string) => (error: unknown) =>
  (error instanceof GitFailure || error instanceof PolicyError) &&
  error.code === expected;

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "realize-shared-git-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  // Только bootstrap disposable repo; проверяемые операции ниже исполняет общий owner.
  await execute("git", ["init", "--initial-branch=main"], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  const git = new Git(root, { profile: "service" });
  await withGitRepositoryLock({ repositoryRoot: root }, async (lease) => {
    git.attachLock(lease);
    try {
      await writeFile(join(root, "owned.txt"), "initial\n");
      await git.run(["add", "owned.txt"]);
      await git.run(["commit", "-m", "Fixture"], { env: identity });
    } finally {
      git.detachLock();
    }
  });
  return { root, git };
}

test("write requires authentic live lease belonging to the same common directory", async (t) => {
  const first = await fixture(t);
  const second = await fixture(t);
  await assert.rejects(
    first.git.run(["config", "fixture.value", "changed"]),
    errorCode("git_lock_required"),
  );
  assert.throws(
    () =>
      first.git.attachLock({
        descriptor: 0,
        commonDirectory: first.root,
        assertHeld() {},
        release: async () => {},
      } as GitLock),
    errorCode("git_lock_invalid"),
  );
  let expired: GitLock | undefined;
  await withGitRepositoryLock({ repositoryRoot: first.root }, async (lease) => {
    expired = lease;
    second.git.attachLock(lease);
    try {
      await assert.rejects(
        second.git.run(["config", "fixture.value", "changed"]),
        errorCode("git_lock_repository_mismatch"),
      );
    } finally {
      second.git.detachLock();
    }
  });
  assert.throws(() => first.git.attachLock(expired!), errorCode("lock_lost"));
});

test("nested borrowed lease remains held, siblings contend and finally releases after error", async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(
    withGitRepositoryLock({ repositoryRoot: root }, async (lease) => {
      await withGitRepositoryLock(
        { repositoryRoot: root, existingLease: lease },
        async (borrowed) => {
          assert.equal(borrowed, lease);
        },
      );
      lease.assertHeld();
      await assert.rejects(
        withGitRepositoryLock({ repositoryRoot: root }, async () => {}),
        errorCode("repository_locked"),
      );
      throw new Error("fixture callback");
    }),
    /fixture callback/u,
  );
  await withGitRepositoryLock({ repositoryRoot: root }, async (lease) =>
    lease.assertHeld(),
  );
});

test("linked worktree uses the same lease and cannot acquire another lock", async (t) => {
  const { root, git } = await fixture(t);
  const linked = join(root, "linked");
  await withGitRepositoryLock({ repositoryRoot: root }, async (lease) => {
    git.attachLock(lease);
    try {
      await git.run(["worktree", "add", "--detach", linked, "HEAD"]);
      await assert.rejects(
        withGitRepositoryLock({ repositoryRoot: linked }, async () => {}),
        errorCode("repository_locked"),
      );
      await withGitRepositoryLock(
        { repositoryRoot: linked, existingLease: lease },
        async (borrowed) => {
          const worktreeGit = new Git(linked, { profile: "service" });
          worktreeGit.attachLock(borrowed);
          await worktreeGit.run([
            "update-ref",
            "refs/heads/linked-proof",
            "HEAD",
          ]);
          worktreeGit.detachLock();
        },
      );
    } finally {
      git.detachLock();
    }
  });
});

test("developer preserves hooks, service suppresses hooks/signing even after caller overrides", async (t) => {
  const { root } = await fixture(t);
  const marker = join(root, "hook-ran");
  await writeFile(
    join(root, ".git/hooks/pre-commit"),
    `#!/bin/sh\nprintf yes > '${marker}'\n`,
    { mode: 0o700 },
  );
  await withGitRepositoryLock({ repositoryRoot: root }, async (lease) => {
    const developer = new Git(root);
    const service = new Git(root, { profile: "service" });
    developer.attachLock(lease);
    service.attachLock(lease);
    await developer.run(
      [
        "-c",
        "commit.gpgSign=false",
        "commit",
        "--allow-empty",
        "-m",
        "Developer",
      ],
      { env: identity },
    );
    assert.equal(await readFile(marker, "utf8"), "yes");
    await rm(marker);
    await service.run(
      [
        "-c",
        `core.hooksPath=${join(root, ".git/hooks")}`,
        "-c",
        "commit.gpgSign=true",
        "commit",
        "--allow-empty",
        "-m",
        "Service",
      ],
      { env: identity },
    );
    await assert.rejects(readFile(marker), { code: "ENOENT" });
    developer.detachLock();
    service.detachLock();
  });
});

test("developer signing is not disabled by common execution", async (t) => {
  const { root } = await fixture(t);
  const signer = join(root, "signer");
  const marker = join(root, "signing-ran");
  await writeFile(signer, `#!/bin/sh\nprintf yes > '${marker}'\nexit 1\n`, {
    mode: 0o700,
  });
  await withGitRepositoryLock({ repositoryRoot: root }, async (lease) => {
    const git = new Git(root);
    git.attachLock(lease);
    await assert.rejects(
      git.run(
        [
          "-c",
          "commit.gpgSign=true",
          "-c",
          `gpg.program=${signer}`,
          "commit",
          "--allow-empty",
          "-m",
          "Signing",
        ],
        { env: identity },
      ),
      errorCode("git_command_failed"),
    );
    assert.equal(await readFile(marker, "utf8"), "yes");
    git.detachLock();
  });
});

test("machine read rejects writes, output abbreviations and executable filters", async (t) => {
  const { root } = await fixture(t);
  const git = new Git(root, { profile: "machine-read" });
  for (const args of [
    ["symbolic-ref", "HEAD", "refs/heads/other"],
    ["symbolic-ref", "--del", "refs/heads/alias"],
    ["diff", "--", "--no-ext-diff", "--no-textconv"],
    ["diff", "--out=escape"],
    ["diff", "--no-ext-diff", "--no-textconv", "--ext-diff"],
    ["cat-file", "--filters", "HEAD:owned.txt"],
    ["cat-file", "--text", "HEAD:owned.txt"],
  ]) {
    await assert.rejects(git.run(args), errorCode("git_arguments_invalid"));
  }
  assert.equal(
    (await git.run(["cat-file", "blob", "HEAD:owned.txt"])).trim(),
    "initial",
  );
});

test("read classification fails closed for mixed mutations and redirected output", () => {
  for (const args of [
    ["branch", "--all", "--delete", "other"],
    ["branch", "-aD", "other"],
    ["config", "--get", "--unset", "fixture.value"],
    ["diff", "--out=target"],
    ["log", "--output=target"],
    ["show", "--o", "target"],
    ["unknown-command"],
  ])
    assert.equal(requiresGitLock(args), true, args.join(" "));
  assert.equal(requiresGitLock(["branch", "--list"]), false);
  assert.equal(requiresGitLock(["config", "--get", "fixture.value"]), false);
});

test("network guard rejects rewrite/include/config overrides before contacting remote", async (t) => {
  const { root, git } = await fixture(t);
  const network = {
    transport: "https" as const,
    askpassPath: await createGitAskpass(root),
    token: "synthetic-token",
  };
  for (const configuration of [
    "url.https://elsewhere.test/.insteadOf=https://example.test/",
    "credential.https://example.test.helper=evil",
  ]) {
    await assert.rejects(
      git.run(
        [
          "-c",
          configuration,
          "ls-remote",
          "https://example.test/repository.git",
        ],
        { network },
      ),
      errorCode("git_network_configuration_denied"),
    );
  }
  await assert.rejects(
    git.run(
      [
        "-c",
        "include.path=/nonexistent-fixture-config",
        "ls-remote",
        "https://example.test/repository.git",
      ],
      { network },
    ),
    errorCode("git_arguments_invalid"),
  );
});

test("askpass emits real newline and never persists credentials", async (t) => {
  const { root } = await fixture(t);
  const path = await createGitAskpass(root);
  const token = "synthetic-token-for-askpass";
  const { stdout: username } = await execute(
    path,
    ["Username for 'https://example.test': "],
    { env: { NODE_ENV: "test" } },
  );
  const { stdout: password } = await execute(
    path,
    ["Password for 'https://x-access-token@example.test': "],
    { env: { NODE_ENV: "test", REALIZE_GIT_HTTP_TOKEN: token } },
  );
  assert.equal(username, "x-access-token\n");
  assert.equal(password, `${token}\n`);
  assert.equal((await readFile(path, "utf8")).includes(token), false);
});

test("create-only publish validates literal destination and pins expected absence", () => {
  const input = {
    remoteURL: "https://github.com/fixture/repository.git",
    reference: "refs/heads/review/fixture",
    commit: "a".repeat(40),
  };
  const args = buildCreateOnlyGitPushArguments(input);
  assert.deepEqual(args, [
    "push",
    "--porcelain",
    "--force-with-lease=refs/heads/review/fixture:",
    "--no-follow-tags",
    "--recurse-submodules=no",
    "--",
    input.remoteURL,
    `${input.commit}:${input.reference}`,
  ]);
  for (const change of [
    { remoteURL: "http://github.com/fixture/repository.git" },
    { remoteURL: "https://token@github.com/fixture/repository.git" },
    { remoteURL: "https://github.com/fixture/repository.git?redirect=1" },
    { remoteURL: "https://github.com/fixture/repository.git#fragment" },
    { reference: "refs/tags/review" },
    { reference: "refs/heads/../main" },
    { reference: "refs/heads/review.lock" },
    { reference: "refs/heads/review//nested" },
    { commit: "0".repeat(40) },
    { commit: "HEAD" },
  ]) {
    assert.throws(
      () => buildCreateOnlyGitPushArguments({ ...input, ...change }),
      errorCode("git_publish_arguments_invalid"),
    );
  }
});
