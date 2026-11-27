/**
 * @file .ai/tools/worker-assignment/test/ideGitDelivery.test.ts
 * @version 1.0.0
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
