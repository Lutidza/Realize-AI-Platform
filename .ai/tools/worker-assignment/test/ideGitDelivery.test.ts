/**
 * @file .ai/tools/worker-assignment/test/ideGitDelivery.test.ts
 * @version 1.0.1
 * @date 2026-11-27
 * @description Проверяет выдачу полномочий, привязку удалённого OID и повтор Git-доставки очереди.
 * @see documentation/specifications/internal-mcp.md
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dispatchIdeGitDelivery } from "../src/dispatchIdeGitDelivery.service";

test("точное назначение передаёт commit и push, повтор использует квитанции, неизвестный исход не закрывает push", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ide-delivery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const task = "Поручение владельца",
    run = randomUUID(),
    grantKey = createHash("sha256").update(randomUUID()).digest("hex");
  const dir = join(root, "git-key-" + grantKey);
  const sha = "b".repeat(40),
    signal = new AbortController().signal;
  const calls: string[] = [];
  let unknown = true;
  const runWork: NonNullable<
    Parameters<typeof dispatchIdeGitDelivery>[6]
  > = async (_root, action, path) => {
    const ctx = JSON.parse(await readFile(path, "utf8"));
    calls.push(action);
    if (action === "push") assert.equal(ctx.target.sourceOid, sha);
    return {
      status: "succeeded",
      errorCode: null,
      result: {
        action,
        status: "succeeded",
        requestId: run + "-" + action,
        branch: "work",
        commit: sha,
        pushStatus: action === "push" ? "succeeded" : "not_requested",
        remoteCommit: action === "push" && !unknown ? sha : null,
      },
    };
  };
  const attempt = (s = task) =>
    dispatchIdeGitDelivery(
      root,
      root,
      run,
      s,
      signal,
      () => {},
      runWork,
      grantKey,
    );
  assert.equal(await attempt(), undefined);
  await mkdir(dir, { mode: 0o700 });
  const base = { repositoryRoot: root };
  await writeFile(
    join(dir, "route.json"),
    JSON.stringify({
      version: 1,
      taskSha256: createHash("sha256").update(task).digest("hex"),
      verification: {},
      commit: {
        context: { ...base, requestId: "$runId-commit" },
        message: "chore: update",
      },
      push: {
        fromCommit: true,
        context: {
          ...base,
          requestId: "$runId-push",
          authorization: {
            actions: ["push"],
            scope: { mode: "commits", commits: ["$commit"] },
          },
          target: { branch: "work", sourceOid: "$commit" },
        },
      },
    }),
    { mode: 0o600 },
  );
  await assert.rejects(attempt("иной запрос"), /assignment_git_task_mismatch/);
  assert.deepEqual(calls, []);
  assert.equal((await attempt())?.status, "blocked");
  unknown = false;
  assert.equal((await attempt())?.status, "completed");
  assert.equal((await attempt())?.status, "completed");
  assert.deepEqual(calls, ["commit", "push", "push"]);
});

test("standalone stage выдаёт только manage с закреплённым путём и принимает доказательство того же HEAD и blob", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ide-stage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = randomUUID(),
    directory = join(root, "git-" + run);
  await mkdir(directory, { mode: 0o700 });
  const task = "Подготовить файл",
    sha = "b".repeat(40),
    sha256 = "c".repeat(64),
    op = { kind: "stage-file", path: "code/file.ts", sha256 };
  const input = {
    version: 1,
    taskSha256: createHash("sha256").update(task).digest("hex"),
    stage: {
      context: {
        version: 1,
        repositoryRoot: root,
        requestId: "$runId-stage",
        projectId: "project",
        taskId: "test",
        authorization: { actions: ["manage"], scope: { mode: "repository" } },
        expected: { head: sha, branch: "work" },
        operation: op,
      },
    },
  };
  const save = (g: unknown) =>
    writeFile(join(directory, "route.json"), JSON.stringify(g), {
      mode: 0o600,
    });
  await save(input);
  let calls = 0,
    committed = false;
  const worker: NonNullable<
    Parameters<typeof dispatchIdeGitDelivery>[6]
  > = async (_root, action, file, plan, message) => {
    calls++;
    assert.equal(action, "manage");
    assert.equal(plan, undefined);
    assert.equal(message, undefined);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")).operation, op);
    return {
      status: "succeeded",
      errorCode: null,
      result: {
        status: "succeeded",
        action,
        requestId: run + "-stage",
        commit: sha,
        branch: "work",
        commitCreated: committed,
        pushStatus: "not_requested",
        details: {
          ...op,
          blobOid: "a".repeat(40),
          otherEntriesSha256: "d".repeat(64),
        },
      },
    };
  };
  const go = () =>
    dispatchIdeGitDelivery(
      root,
      root,
      run,
      task,
      new AbortController().signal,
      () => {},
      worker,
    );
  assert.equal((await go())?.status, "completed");
  committed = true;
  assert.equal((await go())?.status, "blocked");
  await save({ ...input, push: { fromCommit: false, context: {} } });
  await assert.rejects(go());
  assert.equal(calls, 2);
});
