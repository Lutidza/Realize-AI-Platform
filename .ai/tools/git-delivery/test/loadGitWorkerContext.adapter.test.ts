/**
 * @file .ai/tools/git-delivery/test/loadGitWorkerContext.adapter.test.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Проверяет привязку контекста запуска к рабочей копии и отказ при отсутствии разрешённых данных.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { loadGitWorkerContext } from "../src/worker/loadGitWorkerContext.adapter.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "git-worker-context-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "context.json");
  const context = {
    version: 1,
    requestId: "approved-request",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: root,
    authorization: {
      actions: ["commit"],
      scope: { mode: "paths", paths: ["owned.txt"] },
    },
    identity: { name: "Fixture Author", email: "fixture@example.test" },
    verification: {
      inputPaths: ["config.json"],
      requiredChecks: ["content-review"],
      results: [
        { id: "content-review", status: "passed", fingerprint: "a".repeat(64) },
      ],
    },
  };
  const write = (value: unknown) =>
    writeFile(path, JSON.stringify(value), { mode: 0o600 });
  await write(context);
  return { root, path, context, write };
}

test("обычный inspect получает только чтение, commit без контекста запрещён", async (t) => {
  const f = await fixture(t);
  const context = await loadGitWorkerContext("inspect", f.root);
  assert.deepEqual(context.authorization, {
    actions: ["inspect"],
    scope: { mode: "all" },
  });
  assert.ok(!("target" in context));
  assert.equal(context.identity, undefined);
  assert.equal(context.verification, undefined);
  await assert.rejects(loadGitWorkerContext("commit", f.root), {
    code: "context_required",
  });
  await assert.rejects(loadGitWorkerContext("inspect", f.root, ""), {
    code: "context_required",
  });
});

test("запуск сохраняет requestId, scope, identity и evidence вызывающей среды", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(
    await loadGitWorkerContext("commit", f.root, f.path),
    f.context,
  );
  const alias = join(f.root, "alias");
  await symlink(f.root, alias);
  await f.write({ ...f.context, repositoryRoot: alias });
  assert.deepEqual(
    await loadGitWorkerContext("commit", f.root, f.path),
    f.context,
  );
});

test("другая рабочая копия и расширенные actions отклоняются", async (t) => {
  const f = await fixture(t);
  const foreign = join(f.root, "foreign");
  await mkdir(foreign);
  await f.write({ ...f.context, repositoryRoot: foreign });
  await assert.rejects(loadGitWorkerContext("commit", f.root, f.path), {
    code: "worker_repository_mismatch",
  });
  await f.write({
    ...f.context,
    authorization: {
      ...f.context.authorization,
      actions: ["inspect", "commit"],
    },
  });
  await assert.rejects(loadGitWorkerContext("commit", f.root, f.path), {
    code: "worker_scope_invalid",
  });
});

test("адресный inspect переносит входы снимка без разрешения на commit", async (t) => {
  const f = await fixture(t);
  const { identity: _identity, ...context } = f.context;
  const reading = {
    ...context,
    authorization: { ...context.authorization, actions: ["inspect"] },
    verification: {
      inputPaths: ["config.json"],
      requiredChecks: [],
      results: [],
    },
  };
  await f.write(reading);
  assert.deepEqual(
    await loadGitWorkerContext("inspect", f.root, f.path),
    reading,
  );
  await assert.rejects(loadGitWorkerContext("commit", f.root, f.path), {
    code: "worker_scope_invalid",
  });
});

test("автор из БД дополняет только разрешённый commit и не меняет остальные поля", async (t) => {
  const f = await fixture(t);
  const { identity: _identity, ...input } = f.context;
  await f.write(input);
  const author = {
    name: "Configured Author",
    email: "configured@example.test",
  };
  let calls = 0;
  const result = await loadGitWorkerContext("commit", f.root, f.path, {
    async resolveCommitAuthor(root) {
      calls += 1;
      assert.equal(root, f.root);
      return author;
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { ...input, identity: author });
  author.name = "Changed after resolution";
  assert.ok(!("target" in result));
  assert.equal(result.identity?.name, "Configured Author");
});

test("явный автор и inspect обходятся без загрузки автора из БД", async (t) => {
  const f = await fixture(t);
  const dependencies = {
    async resolveCommitAuthor() {
      throw new Error("DB must not be called");
    },
  };
  assert.deepEqual(
    await loadGitWorkerContext("commit", f.root, f.path, dependencies),
    f.context,
  );
  await loadGitWorkerContext("inspect", f.root, undefined, dependencies);
  const { identity: _identity, ...input } = f.context;
  await f.write({
    ...input,
    authorization: { actions: ["inspect"], scope: input.authorization.scope },
    verification: { inputPaths: [], requiredChecks: [], results: [] },
  });
  await loadGitWorkerContext("inspect", f.root, f.path, dependencies);
});

test("корень, разрешение и проверки валидируются до обращения к БД", async (t) => {
  const f = await fixture(t);
  const { identity: _identity, ...input } = f.context;
  const foreign = join(f.root, "other");
  await mkdir(foreign);
  const dependencies = {
    async resolveCommitAuthor() {
      throw new Error("DB must not be called");
    },
  };
  for (const [value, code] of [
    [{ ...input, repositoryRoot: foreign }, "worker_repository_mismatch"],
    [
      {
        ...input,
        authorization: {
          ...input.authorization,
          actions: ["inspect", "commit"],
        },
      },
      "worker_scope_invalid",
    ],
    [
      {
        ...input,
        verification: { inputPaths: [], requiredChecks: [], results: [] },
      },
      "checks_required",
    ],
    [
      { ...input, verification: { ...input.verification, results: [] } },
      "checks_stale_or_missing",
    ],
  ] as const) {
    await f.write(value);
    await assert.rejects(
      loadGitWorkerContext("commit", f.root, f.path, dependencies),
      { code },
    );
  }
});

test("ошибка resolver и некорректный автор не превращаются в готовый контекст", async (t) => {
  const f = await fixture(t);
  const { identity: _identity, ...input } = f.context;
  await f.write(input);
  const failure = new Error("fixture resolver unavailable");
  await assert.rejects(
    loadGitWorkerContext("commit", f.root, f.path, {
      async resolveCommitAuthor() {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
  await assert.rejects(
    loadGitWorkerContext("commit", f.root, f.path, {
      async resolveCommitAuthor() {
        return { name: "Author", email: "invalid" };
      },
    }),
    { code: "invalid_identity" },
  );
});
