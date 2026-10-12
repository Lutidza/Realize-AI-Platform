/**
 * @file .ai/tools/git-delivery/test/deliverGitSyncWorkerCommand.service.test.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет ленивые sync resources и сохранение фактического результата при ошибке закрытия fixture-ресурса.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Git } from "../src/Git.adapter.ts";
import type { GitNetworkConnection } from "../src/network/GitNetwork.types.ts";
import type {
  GitSyncContext,
  GitSyncResources,
} from "../src/sync/GitSync.types.ts";
import { deliverGitSyncWorkerCommand } from "../src/worker/deliverGitSyncWorkerCommand.service.ts";

test("ресурс закрывается один раз, close failure сохраняет succeeded syncStatus и fetchedCommit", async (t) => {
  const temporary = await mkdtemp(
    join(tmpdir(), "realize-sync-resources-fixture-"),
  );
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "repository");
  await mkdir(root);
  const git = new Git(root);
  await git.run(["init", "--initial-branch=main", "--template="]);
  for (const [key, value] of Object.entries({
    "core.hooksPath": "/dev/null",
    "commit.gpgSign": "false",
    "user.name": "Fixture",
    "user.email": "fixture@example.invalid",
  }))
    await git.run(["config", "--local", key, value]);
  await writeFile(join(root, ".gitignore"), "/.ai-workspace/tasks/\n");
  await git.run(["add", ".gitignore"]);
  await git.run(["commit", "-m", "Sync resources fixture"]);
  const commit = (await git.run(["rev-parse", "HEAD"])).trim();
  const context: GitSyncContext = {
    version: 1,
    requestId: "resource-request",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: root,
    authorization: { actions: ["fetch"], scope: { mode: "repository" } },
    target: {
      connectionKey: "github:primary",
      connectionRevision: 1,
      repositorySlug: "fixture-owner/fixture-repository",
      transport: "https",
      branch: "main",
      sourceOid: commit,
      remoteOid: commit,
    },
  };
  const connection: GitNetworkConnection = {
    state: "ready",
    connectionKey: "github:primary",
    revision: 1,
    repositorySlug: context.target.repositorySlug,
    repositoryURL: "https://github.com/fixture-owner/fixture-repository.git",
    transport: "https",
    token: "synthetic-resources-token",
  };
  const calls = { open: 0, resourceClose: 0, networkClose: 0, fetch: 0 };
  const resources: GitSyncResources = {
    dependencies: {
      resolveConnection: async () => connection,
      createNetwork: async () => ({
        readRemoteHead: async () => commit,
        async fetch(ref, previousOid) {
          calls.fetch++;
          await git.run([
            "update-ref",
            ref,
            commit,
            previousOid ?? "0".repeat(40),
          ]);
        },
        async push() {
          assert.fail("Sync не публикует commits.");
        },
        async close() {
          calls.networkClose++;
        },
      }),
    },
    async close() {
      calls.resourceClose++;
      throw new Error("synthetic-private-close-failure");
    },
  };
  const result = await deliverGitSyncWorkerCommand(
    "fetch",
    context,
    async (receivedRoot) => {
      calls.open++;
      assert.equal(receivedRoot, root);
      return resources;
    },
  );
  assert.equal(result.status, "failed", JSON.stringify(result));
  assert.equal(result.errorCode, "connection_cleanup_failed");
  assert.ok("syncStatus" in result);
  assert.equal(result.syncStatus, "succeeded");
  assert.equal(result.fetchedCommit, commit);
  assert.equal(result.trackingRef, "refs/remotes/realize-sync/main");
  assert.deepEqual(calls, {
    open: 1,
    resourceClose: 1,
    networkClose: 1,
    fetch: 1,
  });
  assert.equal(JSON.stringify(result).includes("synthetic-private"), false);
  assert.equal(
    (await git.run(["rev-parse", "refs/remotes/realize-sync/main"])).trim(),
    commit,
  );
});

test("неверный контекст не открывает DB/credential resources", async () => {
  const result = await deliverGitSyncWorkerCommand(
    "fetch",
    { version: 1 } as never,
    async () => assert.fail("Ресурсы не нужны до валидации контекста."),
  );
  assert.equal(result.status, "blocked");
  assert.equal(result.errorCode, "sync_context_invalid");
});
