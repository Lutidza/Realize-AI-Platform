/**
 * @file .ai/tools/git-delivery/test/GitJournal.namespace.test.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет фиксированные namespace Git-журнала поверх общего атомарного JSON owner.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GitJournalRepository } from "../src/GitJournal.repository.ts";
test("Journal namespace and immutable create share secure atomic owner", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "git-journal-namespace-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const context = {
    repositoryRoot: root,
    taskId: "verification",
    requestId: "immutable",
  };
  const legacy = new GitJournalRepository(context);
  assert.ok(legacy.relativePath.includes("/git-delivery/"));
  const store = new GitJournalRepository(context, {
    namespace: "git-verification",
  });
  const results = await Promise.all(
    [1, 2, 3, 4].map((value) => store.saveIfAbsent({ value })),
  );
  assert.equal(results.filter(Boolean).length, 1);
  const original = await store.load();
  assert.equal(await store.saveIfAbsent({ value: 99 }), false);
  assert.deepEqual(await store.load(), original);
  assert.throws(
    () =>
      new GitJournalRepository(context, { namespace: "../escape" } as never),
  );
});
