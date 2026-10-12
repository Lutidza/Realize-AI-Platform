/**
 * @file .ai/tools/git-delivery/test/gitMergeCapability.test.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет отдельный merge tool без параметров, утечки context и повторных вызовов executor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GitWorkerCapabilityService } from "../src/worker/GitWorkerCapability.service.ts";
import { hashGitMergeCandidate } from "../src/merge/hashGitMergeCandidate.util.ts";
import type { GitMergeContext } from "../src/merge/GitMerge.types.ts";
import { emptyResult } from "../src/emptyResult.util.ts";
import { parseGitWorkerCommand } from "../src/worker/parseGitWorkerCommand.validator.ts";

function context(): GitMergeContext {
  const value: GitMergeContext = {
    version: 1,
    requestId: "merge-rpc",
    projectId: "fixture",
    taskId: "fixture-task",
    repositoryRoot: "/tmp/fixture",
    candidateSourceRoot:
      "/tmp/fixture/.ai-workspace/tasks/fixture-task/tmp/candidate",
    authorization: { actions: ["merge"], scope: { mode: "approved-tree" } },
    target: {
      connectionKey: "github:primary",
      connectionRevision: 3,
      repositorySlug: "Owner/Repo",
      repositoryID: 13,
      ref: "refs/heads/main",
      oid: "a".repeat(40),
      treeOid: "b".repeat(40),
    },
    source: { ref: "refs/heads/topic", oid: "c".repeat(40) },
    candidate: { treeOid: "b".repeat(40), approvedChangedPaths: [], files: [] },
    identity: { name: "Fixture", email: "fixture@example.test" },
    message: "Merge accepted tree",
    verification: { requiredChecks: ["review"], results: [] },
  };
  value.verification.results = [
    {
      id: "review",
      status: "passed",
      fingerprint: hashGitMergeCandidate(value),
    },
  ];
  return value;
}
const request = (
  arguments_: Record<string, unknown> = {},
  tool = "git_merge",
) => ({
  threadId: "thread",
  turnId: "turn",
  callId: "call",
  tool,
  arguments: arguments_,
});

test("merge capability открывает только git_merge({}) и хранит один фактический результат", async () => {
  let calls = 0;
  const assigned = context();
  const expected = structuredClone(assigned);
  const capability = new GitWorkerCapabilityService(
    { action: "merge" },
    assigned,
    async (command, received) => {
      calls++;
      assert.deepEqual(command, { action: "merge" });
      assert.deepEqual(received, expected);
      return {
        ...emptyResult(),
        action: "merge",
        status: "succeeded",
        mergedTree: expected.candidate.treeOid,
        remoteCommit: "e".repeat(40),
        mergeStatus: "succeeded",
      };
    },
  );
  capability.threadId = "thread";
  capability.turnId = "turn";
  assert.deepEqual(
    capability.tools.map((item) => item.name),
    ["git_merge"],
  );
  assert.deepEqual(capability.tools[0].inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  assert.equal(JSON.stringify(capability.tools).includes("Owner/Repo"), false);
  assert.equal(
    JSON.stringify(capability.tools).includes("candidateSourceRoot"),
    false,
  );
  assigned.candidate.treeOid = "f".repeat(40);
  await capability.handle("item/tool/call", request());
  await capability.handle("item/tool/call", request());
  assert.equal(calls, 1);
  assert.equal((await capability.getResult())?.status, "succeeded");
  assert.deepEqual(parseGitWorkerCommand({ action: "merge" }), {
    action: "merge",
  });
  assert.throws(() =>
    parseGitWorkerCommand({ action: "merge", message: "forbidden" }),
  );
});
for (const input of [
  request({ force: false }),
  request({}, "git_manage"),
  { ...request(), threadId: "other" },
])
  test("merge capability отвергает параметры/другой tool/session до executor", async () => {
    let calls = 0;
    const capability = new GitWorkerCapabilityService(
      { action: "merge" },
      context(),
      async () => {
        calls++;
        throw Error("must not run");
      },
    );
    capability.threadId = "thread";
    capability.turnId = "turn";
    await assert.rejects(() => capability.handle("item/tool/call", input));
    assert.equal(calls, 0);
    assert.equal(capability.violation, true);
  });
