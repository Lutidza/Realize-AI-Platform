/**
 * @file .ai/tools/git-delivery/test/gitSync.service.test.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет fetch/pull, stale разрешения и восстановление только во временных Git-репозиториях с fixture-сетью.
 */
import { FixtureGit } from "./fixtures/FixtureGit.adapter.ts";

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { Git } from "@realize/git-runtime";
import { GitFailure } from "@realize/git-runtime";
import { GitJournalRepository } from "../src/GitJournal.repository.ts";
import type { GitNetworkConnection } from "../src/network/GitNetwork.types.ts";
import type {
  GitSyncAction,
  GitSyncContext,
  GitSyncDependencies,
  GitSyncJournal,
} from "../src/sync/GitSync.types.ts";
import { gitSyncTrackingRef } from "../src/sync/GitSyncJournal.service.ts";
import { runGitSync } from "../src/sync/runGitSync.service.ts";
import { validateGitSyncContext } from "../src/sync/validateGitSyncContext.validator.ts";

async function fixture(t: TestContext, action: GitSyncAction = "fetch") {
  const temporary = await mkdtemp(join(tmpdir(), "realize-git-sync-fixture-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "repository");
  await mkdir(root);
  const git = new FixtureGit(root);
  await git.run(["init", "--initial-branch=main", "--template="]);
  for (const [key, value] of Object.entries({
    "core.hooksPath": "/dev/null",
    "commit.gpgSign": "false",
    "core.autocrlf": "false",
    "core.excludesFile": "/dev/null",
    "core.attributesFile": "/dev/null",
    "user.name": "Fixture",
    "user.email": "fixture@example.invalid",
  }))
    await git.run(["config", "--local", key, value]);
  await writeFile(
    join(root, ".gitignore"),
    "/.ai-workspace/tasks/\nignored.txt\n",
  );
  await writeFile(join(root, "owned.txt"), "seed\n");
  await git.run(["add", "--all"]);
  await git.run(["commit", "-m", "Fixture seed"]);
  const source = (await git.run(["rev-parse", "HEAD"])).trim();
  await git.run(["switch", "-c", "fixture-remote"]);
  await writeFile(join(root, "owned.txt"), "remote version\n");
  await git.run(["add", "owned.txt"]);
  await git.run(["commit", "-m", "Fixture remote advance"]);
  const remote = (await git.run(["rev-parse", "HEAD"])).trim();
  await git.run(["switch", "main"]);
  const context: GitSyncContext = {
    version: 1,
    requestId: "sync-request",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: root,
    authorization: { actions: [action], scope: { mode: "repository" } },
    target: {
      connectionKey: "github:primary",
      connectionRevision: 7,
      repositorySlug: "fixture-owner/fixture-repository",
      transport: "https",
      branch: "main",
      sourceOid: source,
      remoteOid: remote,
    },
  };
  const connection: GitNetworkConnection = {
    state: "ready",
    connectionKey: "github:primary",
    revision: 7,
    repositorySlug: context.target.repositorySlug,
    repositoryURL: "https://github.com/fixture-owner/fixture-repository.git",
    transport: "https",
    token: "synthetic-sync-token",
  };
  const repository = new GitJournalRepository(context);
  const journal = async () =>
    (await repository.load()) as GitSyncJournal | null;
  const calls = { resolve: 0, read: 0, fetch: 0, push: 0, close: 0 };
  let networkGit: Git;
  const network = {
    remote: remote as string | null,
    async readRemoteHead() {
      calls.read++;
      return network.remote;
    },
    async fetch(ref: string, previousOid: string | null) {
      calls.fetch++;
      assert.equal((await journal())?.phase, "fetching");
      await networkGit.run([
        "update-ref",
        ref,
        context.target.remoteOid,
        previousOid ?? "0".repeat(source.length),
      ]);
    },
    async push() {
      calls.push++;
      assert.fail("Sync не публикует commits.");
    },
    async close() {
      calls.close++;
    },
  };
  const dependencies: GitSyncDependencies = {
    async resolveConnection() {
      calls.resolve++;
      return structuredClone(connection);
    },
    async createNetwork(receivedGit, receivedConnection, target) {
      networkGit = receivedGit;
      assert.equal(receivedGit.root, root);
      assert.deepEqual(receivedConnection, connection);
      assert.deepEqual(target, context.target);
      return network;
    },
  };
  const head = async () => (await git.run(["rev-parse", "HEAD"])).trim();
  const tracking = async () => {
    try {
      return (
        await git.run(["rev-parse", "--verify", gitSyncTrackingRef(context)])
      ).trim();
    } catch {
      return null;
    }
  };
  return {
    root,
    git,
    context,
    source,
    remote,
    connection,
    repository,
    journal,
    calls,
    network,
    dependencies,
    head,
    tracking,
  };
}

test("fetch сохраняет dirty worktree/index, создаёт только own ref и replay не идёт в сеть", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.root, "owned.txt"), "staged\n");
  await f.git.run(["add", "owned.txt"]);
  await writeFile(join(f.root, "owned.txt"), "unstaged\n");
  const indexBefore = await readFile(join(f.root, ".git/index"));
  const result = await runGitSync("fetch", f.context, f.dependencies);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.fetchedCommit, f.remote);
  assert.equal(result.trackingRef, gitSyncTrackingRef(f.context));
  assert.equal(await f.head(), f.source);
  assert.deepEqual(await readFile(join(f.root, ".git/index")), indexBefore);
  assert.equal(await readFile(join(f.root, "owned.txt"), "utf8"), "unstaged\n");
  const before = { ...f.calls };
  const replay = await runGitSync("fetch", f.context, f.dependencies);
  assert.equal(replay.status, "noop", JSON.stringify(replay));
  assert.deepEqual(f.calls, before);
  assert.equal((await f.journal())?.phase, "succeeded");
});

test("pull fast-forward обновляет tracked content, удаляет own ref и replay не применяет ещё раз", async (t) => {
  const f = await fixture(t, "pull");
  const result = await runGitSync("pull", f.context, f.dependencies);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.commit, f.remote);
  assert.equal(result.commitCreated, false);
  assert.equal(result.trackingRef, null);
  assert.equal(await f.head(), f.remote);
  assert.equal(await f.tracking(), null);
  assert.equal(
    await readFile(join(f.root, "owned.txt"), "utf8"),
    "remote version\n",
  );
  assert.equal(
    (await f.git.run(["symbolic-ref", "HEAD"])).trim(),
    "refs/heads/main",
  );
  assert.equal((await f.git.run(["rev-list", "--count", "HEAD"])).trim(), "2");
  const before = { ...f.calls };
  assert.equal(
    (await runGitSync("pull", f.context, f.dependencies)).status,
    "noop",
  );
  assert.deepEqual(f.calls, before);
});

test("dirty staged/unstaged/untracked worktree блокирует pull до сети и сохраняет bytes", async (t) => {
  for (const mode of ["staged", "unstaged", "untracked"] as const)
    await t.test(mode, async (child) => {
      const f = await fixture(child, "pull");
      const filename = mode === "untracked" ? "new.txt" : "owned.txt";
      await writeFile(join(f.root, filename), "local change\n");
      if (mode === "staged") await f.git.run(["add", filename]);
      const indexBefore = await readFile(join(f.root, ".git/index"));
      const result = await runGitSync("pull", f.context, f.dependencies);
      assert.equal(result.status, "blocked", JSON.stringify(result));
      assert.equal(result.errorCode, "pull_worktree_dirty");
      assert.equal(f.calls.resolve, 0);
      assert.equal(f.calls.fetch, 0);
      assert.equal(await f.head(), f.source);
      assert.deepEqual(await readFile(join(f.root, ".git/index")), indexBefore);
      assert.equal(
        await readFile(join(f.root, filename), "utf8"),
        "local change\n",
      );
    });
});

test("divergent pull оставляет HEAD и файлы, без merge/rebase/reset/force", async (t) => {
  const f = await fixture(t, "pull");
  await writeFile(join(f.root, "local.txt"), "local commit\n");
  await f.git.run(["add", "local.txt"]);
  await f.git.run(["commit", "-m", "Divergent fixture commit"]);
  f.context.target.sourceOid = await f.head();
  const result = await runGitSync("pull", f.context, f.dependencies);
  assert.equal(result.status, "partial", JSON.stringify(result));
  assert.equal(result.errorCode, "pull_not_fast_forward");
  assert.equal(await f.head(), f.context.target.sourceOid);
  assert.equal(await readFile(join(f.root, "owned.txt"), "utf8"), "seed\n");
  assert.equal(
    await readFile(join(f.root, "local.txt"), "utf8"),
    "local commit\n",
  );
});

test("remote change до/после fetch и revision mismatch не применяют pull", async (t) => {
  for (const mode of [
    "remote-before",
    "remote-after",
    "revision",
    "revision-prefetch",
  ] as const)
    await t.test(mode, async (child) => {
      const f = await fixture(child, "pull");
      if (mode === "remote-before") f.network.remote = f.source;
      if (mode === "remote-after") {
        const fetch = f.network.fetch;
        f.network.fetch = async (ref, previousOid) => {
          await fetch(ref, previousOid);
          f.network.remote = f.source;
        };
      }
      if (mode.startsWith("revision"))
        f.dependencies.resolveConnection = async () => {
          f.calls.resolve++;
          return {
            ...f.connection,
            revision: mode === "revision" || f.calls.resolve > 1 ? 8 : 7,
          };
        };
      const result = await runGitSync("pull", f.context, f.dependencies);
      assert.equal(
        result.status,
        mode === "remote-after" ? "partial" : "blocked",
        JSON.stringify(result),
      );
      assert.equal(
        result.errorCode,
        mode.startsWith("revision")
          ? "connection_changed"
          : "sync_remote_changed",
      );
      assert.equal(await f.head(), f.source);
      assert.equal(f.calls.fetch, mode === "remote-after" ? 1 : 0);
    });
});

test("interrupted fetch с атомарно записанным ref восстанавливается без второго fetch и без секретов", async (t) => {
  const f = await fixture(t);
  const fetch = f.network.fetch;
  f.network.fetch = async (ref, previousOid) => {
    await fetch(ref, previousOid);
    throw new GitFailure(
      "git_command_failed",
      "synthetic-private-token-in-stderr",
      128,
      "transport_failure",
    );
  };
  const failed = await runGitSync("fetch", f.context, f.dependencies);
  assert.equal(failed.status, "partial", JSON.stringify(failed));
  assert.equal((await f.journal())?.phase, "unknown");
  assert.equal(
    JSON.stringify({ failed, journal: await f.journal() }).includes(
      "synthetic-private",
    ),
    false,
  );
  const recovered = await runGitSync("fetch", f.context, f.dependencies);
  assert.equal(recovered.status, "succeeded", JSON.stringify(recovered));
  assert.equal(f.calls.fetch, 1);
  assert.equal((await f.journal())?.phase, "succeeded");
});

test("interrupted fetch без ref повторяет только прежний snapshot, changed context конфликтует", async (t) => {
  const f = await fixture(t);
  const fetch = f.network.fetch;
  f.network.fetch = async () => {
    f.calls.fetch++;
    throw new Error("synthetic-private-driver-error");
  };
  assert.equal(
    (await runGitSync("fetch", f.context, f.dependencies)).status,
    "partial",
  );
  const calls = { ...f.calls };
  const changed = structuredClone(f.context);
  changed.target.repositorySlug = "fixture-owner/other-repository";
  const conflict = await runGitSync("fetch", changed, f.dependencies);
  assert.equal(conflict.status, "blocked");
  assert.equal(conflict.errorCode, "request_conflict");
  assert.deepEqual(f.calls, calls);
  f.network.fetch = fetch;
  assert.equal(
    (await runGitSync("fetch", f.context, f.dependencies)).status,
    "succeeded",
  );
  assert.equal(f.calls.fetch, 2);
});

test("interrupted pull applying восстанавливает только подтверждённый HEAD, own foreign ref не удаляет", async (t) => {
  const f = await fixture(t, "pull");
  assert.equal(
    (await runGitSync("pull", f.context, f.dependencies)).status,
    "succeeded",
  );
  const journal = await f.journal();
  assert.ok(journal);
  await f.repository.save({ ...journal, phase: "applying" });
  await f.git.run(["update-ref", journal.trackingRef, f.remote]);
  const calls = { ...f.calls };
  assert.equal(
    (await runGitSync("pull", f.context, f.dependencies)).status,
    "noop",
  );
  assert.deepEqual(f.calls, calls);
  assert.equal(await f.tracking(), null);
  await f.git.run(["update-ref", journal.trackingRef, f.source]);
  const changed = await runGitSync("pull", f.context, f.dependencies);
  assert.equal(changed.status, "blocked");
  assert.equal(changed.errorCode, "sync_tracking_changed");
  assert.equal(await f.tracking(), f.source);
});

test("stale HEAD/branch, operations, shallow и скрытые index flags блокируют sync", async (t) => {
  for (const mode of [
    "head",
    "branch",
    "operation",
    "shallow",
    "replace",
    "grafts",
    "assume",
    "skip",
  ] as const)
    await t.test(mode, async (child) => {
      const f = await fixture(child, "pull");
      if (mode === "head") f.context.target.sourceOid = f.remote;
      if (mode === "branch") f.context.target.branch = "fixture-remote";
      if (mode === "operation")
        await writeFile(join(f.root, ".git/MERGE_HEAD"), f.remote + "\n");
      if (mode === "shallow")
        await writeFile(join(f.root, ".git/shallow"), f.source + "\n");
      if (mode === "replace") await f.git.run(["replace", f.source, f.remote]);
      if (mode === "grafts") {
        await mkdir(join(f.root, ".git/info"));
        await writeFile(join(f.root, ".git/info/grafts"), f.source + "\n");
      }
      if (mode === "assume")
        await f.git.run(["update-index", "--assume-unchanged", "owned.txt"]);
      if (mode === "skip")
        await f.git.run(["update-index", "--skip-worktree", "owned.txt"]);
      const result = await runGitSync("pull", f.context, f.dependencies);
      assert.equal(result.status, "blocked", JSON.stringify(result));
      assert.equal(f.calls.resolve, 0);
      assert.equal(f.calls.fetch, 0);
    });
});

test("strict sync context отвергает расширение полномочий, отсутствующий OID и произвольный transport", async (t) => {
  const f = await fixture(t);
  for (const mutate of [
    (context: Record<string, unknown>) => {
      context.command = "reset --hard";
    },
    (context: Record<string, unknown>) => {
      context.authorization = {
        actions: ["fetch", "pull"],
        scope: { mode: "repository" },
      };
    },
    (context: Record<string, unknown>) => {
      context.authorization = { actions: ["fetch"], scope: { mode: "all" } };
    },
    (context: Record<string, unknown>) => {
      (context.target as Record<string, unknown>).remoteOid = null;
    },
    (context: Record<string, unknown>) => {
      (context.target as Record<string, unknown>).sourceOid = "0".repeat(40);
    },
    (context: Record<string, unknown>) => {
      (context.target as Record<string, unknown>).repositoryURL =
        "https://foreign.invalid/repo.git";
    },
    (context: Record<string, unknown>) => {
      (context.target as Record<string, unknown>).branch = "--upload-pack=evil";
    },
    (context: Record<string, unknown>) => {
      (context.target as Record<string, unknown>).transport = "file";
    },
  ]) {
    const context = structuredClone(f.context) as unknown as Record<
      string,
      unknown
    >;
    mutate(context);
    assert.throws(() => validateGitSyncContext(context));
  }
  assert.throws(() => validateGitSyncContext(f.context, "pull"));
  const parsed = validateGitSyncContext(f.context);
  f.context.target.branch = "different";
  assert.equal(parsed.target.branch, "main");
});

test("новый request обновляет один stable ref через prior OID, старый replay не перезаписывает новый", async (t) => {
  const f = await fixture(t);
  const oldContext = structuredClone(f.context);
  assert.equal(
    (await runGitSync("fetch", f.context, f.dependencies)).status,
    "succeeded",
  );
  await f.git.run(["switch", "fixture-remote"]);
  await writeFile(join(f.root, "owned.txt"), "second remote version\n");
  await f.git.run(["add", "owned.txt"]);
  await f.git.run(["commit", "-m", "Second fixture advance"]);
  const newRemote = await f.head();
  await f.git.run(["switch", "main"]);
  f.context.requestId = "sync-second-request";
  f.context.target.remoteOid = newRemote;
  f.network.remote = newRemote;
  const result = await runGitSync("fetch", f.context, f.dependencies);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal((await f.journal())?.previousOid, f.remote);
  const refs = (
    await f.git.run([
      "for-each-ref",
      "--format=%(refname)",
      "refs/remotes/realize-sync/",
    ])
  )
    .trim()
    .split("\n");
  assert.deepEqual(refs, ["refs/remotes/realize-sync/main"]);
  const before = { ...f.calls };
  const replay = await runGitSync("fetch", oldContext, f.dependencies);
  assert.equal(replay.status, "blocked");
  assert.equal(replay.errorCode, "sync_tracking_changed");
  assert.equal(await f.tracking(), newRemote);
  assert.deepEqual(f.calls, before);
});

test("pull не перезаписывает ignored untracked файл при fast-forward", async (t) => {
  const f = await fixture(t, "pull");
  await f.git.run(["switch", "fixture-remote"]);
  await writeFile(join(f.root, "ignored.txt"), "incoming tracked\n");
  await f.git.run(["add", "--force", "ignored.txt"]);
  await f.git.run(["commit", "-m", "Incoming ignored fixture path"]);
  f.context.target.remoteOid = await f.head();
  f.network.remote = f.context.target.remoteOid;
  await f.git.run(["switch", "main"]);
  await writeFile(join(f.root, "ignored.txt"), "local ignored bytes\n");
  const result = await runGitSync("pull", f.context, f.dependencies);
  assert.equal(result.status, "partial", JSON.stringify(result));
  assert.equal(await f.head(), f.source);
  assert.equal(
    await readFile(join(f.root, "ignored.txt"), "utf8"),
    "local ignored bytes\n",
  );
});

test("pull блокирует current и incoming gitlinks, fetch получает их commit без checkout подмодулей", async (t) => {
  for (const mode of ["current", "incoming", "fetch-incoming"] as const)
    await t.test(mode, async (child) => {
      const f = await fixture(
        child,
        mode === "fetch-incoming" ? "fetch" : "pull",
      );
      if (mode !== "current") await f.git.run(["switch", "fixture-remote"]);
      await f.git.run([
        "update-index",
        "--add",
        "--cacheinfo",
        `160000,${f.source},nested-module`,
      ]);
      await f.git.run(["commit", "-m", "Fixture gitlink"]);
      if (mode === "current") f.context.target.sourceOid = await f.head();
      else {
        f.context.target.remoteOid = await f.head();
        f.network.remote = f.context.target.remoteOid;
        await f.git.run(["switch", "main"]);
      }
      const result = await runGitSync(
        mode === "fetch-incoming" ? "fetch" : "pull",
        f.context,
        f.dependencies,
      );
      assert.equal(
        result.status,
        mode === "fetch-incoming"
          ? "succeeded"
          : mode === "current"
            ? "blocked"
            : "partial",
        JSON.stringify(result),
      );
      if (mode !== "fetch-incoming")
        assert.equal(result.errorCode, "pull_submodules_unsupported");
      assert.equal(await f.head(), f.context.target.sourceOid);
      if (mode === "current") assert.equal(f.calls.resolve, 0);
      if (mode !== "current")
        assert.equal(
          (await f.git.run(["ls-files", "nested-module"])).trim(),
          "",
        );
    });
});
