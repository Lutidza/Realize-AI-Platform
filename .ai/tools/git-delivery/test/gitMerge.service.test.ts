/**
 * @file .ai/tools/git-delivery/test/gitMerge.service.test.ts
 * @version 1.0.2
 * @date 2026-10-13
 * @description Проверяет approved-tree merge, неизменность checkout и recovery без повторных API mutations во временных fixtures.
 */
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { readFile, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import {
  createDeliveryFixture,
  identity,
} from "./fixtures/createDeliveryFixture.adapter.ts";
import {
  hashGitMergeCandidate,
  hashGitMergeCommit,
} from "../src/merge/hashGitMergeCandidate.util.ts";
import { validateGitMergeContext } from "../src/merge/validateGitMergeContext.validator.ts";
import { runGitMerge } from "../src/merge/runGitMerge.service.ts";
import type {
  GitMergeCommit,
  GitMergeCommitBody,
  GitMergeContext,
  GitMergeDependencies,
  GitMergeRemote,
  GitMergeTree,
} from "../src/merge/GitMerge.types.ts";
import {
  hashGitBlob,
  hashGitTree,
  applyGitTreeChanges,
} from "../src/merge/hashGitTree.util.ts";

async function fixture(t: TestContext) {
  const f = await createDeliveryFixture(t);
  const head = await f.head();
  const tree = (await f.git.run(["rev-parse", "HEAD^{tree}"])).trim();
  const blob = (
    await f.git.run(["hash-object", "-w", "--stdin"], {
      input: "accepted candidate\n",
    })
  ).trim();
  const raw = await f.git.run(["ls-tree", "HEAD"]);
  const candidateRaw =
    raw
      .split("\n")
      .filter(Boolean)
      .map((line) =>
        line.endsWith("\towned.txt") ? `100644 blob ${blob}\towned.txt` : line,
      )
      .join("\n") + "\n";
  const candidate = (
    await f.git.run(["mktree"], { input: candidateRaw })
  ).trim();
  const source = (
    await f.git.run(["commit-tree", tree, "-p", head], {
      input: "fixture topic\n",
    })
  ).trim();
  await f.git.run(["branch", "topic", source]);
  const asTree = (oid: string, input: string): GitMergeTree => ({
    sha: oid,
    truncated: false,
    tree: input
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = /^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/.exec(line)!;
        return {
          mode: match[1],
          type: match[2],
          sha: match[3],
          path: match[4],
        };
      }),
  });
  const targetTree = asTree(tree, raw);
  const candidateTree = asTree(candidate, candidateRaw);
  const candidateSourceRoot = join(
    f.root,
    ".ai-workspace/tasks/fixture-task/tmp/candidate",
  );
  await mkdir(candidateSourceRoot, { recursive: true });
  await writeFile(
    join(candidateSourceRoot, "owned.txt"),
    "accepted candidate\n",
  );
  const context: GitMergeContext = {
    version: 1,
    requestId: "merge-fixture-1",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: f.root,
    candidateSourceRoot,
    authorization: { actions: ["merge"], scope: { mode: "approved-tree" } },
    target: {
      connectionKey: "github:primary",
      connectionRevision: 3,
      repositorySlug: "Owner/Repo",
      repositoryID: 13,
      ref: "refs/heads/main",
      oid: head,
      treeOid: tree,
    },
    source: { ref: "refs/heads/topic", oid: source },
    candidate: {
      treeOid: candidate,
      approvedChangedPaths: ["owned.txt"],
      files: [{ path: "owned.txt", mode: "100644", blobOid: blob }],
    },
    identity,
    message: "Merge accepted fixture",
    verification: { requiredChecks: ["merge-review"], results: [] },
  };
  context.verification.results = [
    {
      id: "merge-review",
      status: "passed",
      fingerprint: hashGitMergeCandidate(context),
    },
  ];
  const date = "2026-10-13T00:00:00Z";
  const objects = new Map<string, GitMergeCommit>([
    [
      head,
      {
        sha: head,
        treeOid: tree,
        parents: [],
        message: "fixture\n",
        author: { ...identity, date },
        committer: { ...identity, date },
      },
    ],
    [
      source,
      {
        sha: source,
        treeOid: tree,
        parents: [head],
        message: "fixture source\n",
        author: { ...identity, date },
        committer: { ...identity, date },
      },
    ],
  ]);
  let remoteHead = head,
    creates = 0,
    updates = 0,
    blobs = 0,
    trees = 0;
  const hooks = { create: "ok", update: "ok", blob: "ok", tree: "ok" };
  const flags = { candidateAvailable: true, stripMessageLF: false };
  const knownBlobs = new Set(targetTree.tree.map((entry) => entry.sha));
  const remote: GitMergeRemote = {
    readRepository: async () => ({ id: 13, fullName: "Owner/Repo" }),
    readRef: async (ref) => (ref === context.target.ref ? remoteHead : source),
    readCommit: async (oid) => objects.get(oid) ?? null,
    readTree: async (oid) =>
      oid === tree
        ? structuredClone(targetTree)
        : flags.candidateAvailable
          ? structuredClone(candidateTree)
          : null,
    hasBlob: async (oid) => knownBlobs.has(oid),
    createBlob: async (bytes) => {
      blobs++;
      if (hooks.blob === "fail-before") throw Error("private provider data");
      const oid = hashGitBlob(bytes);
      knownBlobs.add(oid);
      if (hooks.blob === "fail-after") throw Error("private provider data");
      return oid;
    },
    createTree: async (base, entries) => {
      trees++;
      assert.equal(base, tree);
      const oid = hashGitTree(applyGitTreeChanges(targetTree.tree, entries));
      assert.equal(oid, candidate);
      if (hooks.tree === "fail-before") throw Error("private provider data");
      flags.candidateAvailable = true;
      if (hooks.tree === "fail-after") throw Error("private provider data");
      return oid;
    },
    createCommit: async (body) => {
      creates++;
      if (hooks.create === "fail-before") throw Error("private provider data");
      const result: GitMergeCommit = {
        sha: hashGitMergeCommit(body),
        treeOid: body.tree,
        parents: body.parents,
        message: flags.stripMessageLF
          ? body.message.slice(0, -1)
          : body.message,
        author: body.author,
        committer: body.committer,
      };
      objects.set(result.sha, result);
      if (hooks.create === "fail-after") throw Error("private provider data");
      return result;
    },
    updateRef: async (ref, oid) => {
      assert.equal(ref, context.target.ref);
      updates++;
      if (hooks.update === "fail-before") throw Error("private provider data");
      remoteHead = oid;
      if (hooks.update === "fail-after") throw Error("private provider data");
      return oid;
    },
  };
  const dependencies: GitMergeDependencies = {
    resolveConnection: async () => ({
      state: "ready",
      revision: 3,
      repositorySlug: "Owner/Repo",
      token: "fixture-credential",
    }),
    createRemote: () => remote,
  };
  return {
    ...f,
    context,
    targetTree,
    candidateTree,
    dependencies,
    remote,
    hooks,
    flags,
    objects,
    get creates() {
      return creates;
    },
    get updates() {
      return updates;
    },
    get blobs() {
      return blobs;
    },
    get trees() {
      return trees;
    },
    journalFile: join(
      f.root,
      `.ai-workspace/tasks/fixture-task/logs/git-delivery/${context.requestId}.json`,
    ),
  };
}

test("approved-tree merge оставляет HEAD/index/files; replay не создаёт второй commit/update", async (t) => {
  const f = await fixture(t);
  const index = await f.index();
  const bytes = await readFile(join(f.root, "owned.txt"));
  const result = await runGitMerge(f.context, f.dependencies);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.mergedTree, f.context.candidate.treeOid);
  assert.equal(f.creates, 1);
  assert.equal(f.updates, 1);
  assert.equal(await f.head(), f.context.target.oid);
  assert.deepEqual(await f.index(), index);
  assert.deepEqual(await readFile(join(f.root, "owned.txt")), bytes);
  const stored = JSON.parse(await readFile(f.journalFile, "utf8"));
  const expected = (
    await f.git.run(["hash-object", "-t", "commit", "--stdin"], {
      input: `tree ${stored.body.tree}\nparent ${stored.body.parents[0]}\nparent ${stored.body.parents[1]}\nauthor ${identity.name} <${identity.email}> ${Date.parse(stored.body.author.date) / 1000} +0000\ncommitter ${identity.name} <${identity.email}> ${Date.parse(stored.body.committer.date) / 1000} +0000\n\n${stored.body.message}`,
    })
  ).trim();
  assert.equal(stored.expectedCommit, expected);
  assert.equal((await runGitMerge(f.context, f.dependencies)).status, "noop");
  assert.equal(f.creates, 1);
  assert.equal(f.updates, 1);
  assert.equal(JSON.stringify(result).includes("fixture-credential"), false);
});

test("GitHub DTO без одного terminal LF принимается при exact commit OID и metadata", async (t) => {
  const f = await fixture(t);
  f.flags.stripMessageLF = true;
  const result = await runGitMerge(f.context, f.dependencies);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  const journal = JSON.parse(await readFile(f.journalFile, "utf8"));
  assert.equal(
    f.objects.get(journal.expectedCommit)!.message + "\n",
    journal.body.message,
  );
  assert.equal(result.commit, journal.expectedCommit);
  assert.equal(f.creates, 1);
  assert.equal(f.updates, 1);
  assert.equal((await runGitMerge(f.context, f.dependencies)).status, "noop");
  assert.equal(f.creates, 1);
  assert.equal(f.updates, 1);
});

test("unknown creating восстанавливает тот же existing DTO без LF без второго POST", async (t) => {
  const f = await fixture(t);
  f.flags.stripMessageLF = true;
  f.hooks.create = "fail-after";
  const first = await runGitMerge(f.context, f.dependencies);
  assert.equal(first.status, "partial", JSON.stringify(first));
  const before = JSON.parse(await readFile(f.journalFile, "utf8"));
  assert.equal(before.phase, "unknown");
  assert.equal(before.uncertainStage, "creating");
  assert.equal(f.updates, 0);
  f.hooks.create = "ok";
  const second = await runGitMerge(f.context, f.dependencies);
  assert.equal(second.status, "succeeded", JSON.stringify(second));
  const after = JSON.parse(await readFile(f.journalFile, "utf8"));
  assert.deepEqual(after.body, before.body);
  assert.equal(after.expectedCommit, before.expectedCommit);
  assert.equal(second.commit, before.expectedCommit);
  assert.equal(f.creates, 1);
  assert.equal(f.updates, 1);
});

for (const variant of [
  "space",
  "extra-LF",
  "removed-content",
  "wrong-oid",
] as const)
  test(`${variant}: DTO message допуск не ослабляет whitespace или commit OID`, async (t) => {
    const f = await fixture(t);
    const create = f.remote.createCommit;
    f.remote.createCommit = async (body) => {
      const commit = await create(body);
      if (variant === "wrong-oid") return { ...commit, sha: "f".repeat(40) };
      return {
        ...commit,
        message:
          variant === "space"
            ? commit.message.slice(0, -1) + " \n"
            : variant === "extra-LF"
              ? commit.message + "\n"
              : commit.message.slice(0, -2),
      };
    };
    const result = await runGitMerge(f.context, f.dependencies);
    assert.equal(result.status, "partial", JSON.stringify(result));
    assert.equal(result.errorCode, "merge_commit_mismatch");
    assert.equal(f.creates, 1);
    assert.equal(f.updates, 0);
    const journal = JSON.parse(await readFile(f.journalFile, "utf8"));
    assert.equal(journal.phase, "unknown");
    assert.equal(journal.uncertainStage, "creating");
  });

for (const failure of [
  "create-before",
  "create-after",
  "update-before",
  "update-after",
] as const)
  test(`${failure}: unknown outcome сверяется без повторной API mutation`, async (t) => {
    const f = await fixture(t);
    f.hooks[failure.startsWith("create") ? "create" : "update"] =
      failure.endsWith("before") ? "fail-before" : "fail-after";
    const first = await runGitMerge(f.context, f.dependencies);
    assert.equal(first.status, "partial");
    assert.equal(first.mergeStatus, "unknown");
    assert.equal(
      JSON.stringify(first).includes("private provider data"),
      false,
    );
    f.hooks.create = "ok";
    f.hooks.update = "ok";
    const second = await runGitMerge(f.context, f.dependencies);
    assert.equal(f.creates, 1);
    if (failure === "create-after") {
      assert.equal(second.status, "succeeded", JSON.stringify(second));
      assert.equal(f.updates, 1);
    } else if (failure === "update-after") {
      assert.equal(second.status, "noop", JSON.stringify(second));
      assert.equal(f.updates, 1);
    } else {
      assert.equal(second.status, "blocked", JSON.stringify(second));
      assert.equal(f.updates, failure === "update-before" ? 1 : 0);
    }
  });

for (const change of ["extra-path", "extra-mode", "truncated"] as const)
  test(`${change}: непринятый tree блокируется до POST`, async (t) => {
    const f = await fixture(t);
    if (change === "truncated") f.candidateTree.truncated = true;
    else {
      const entry = f.candidateTree.tree.find(
        (entry) => entry.path === "foreign.txt",
      )!;
      if (change === "extra-path") entry.sha = "a".repeat(40);
      else entry.mode = "100755";
    }
    const result = await runGitMerge(f.context, f.dependencies);
    assert.equal(result.status, "blocked", JSON.stringify(result));
    assert.equal(f.creates, 0);
    assert.equal(f.updates, 0);
  });

test("stale checks, arbitrary refs, protected paths и дополнительное действие отвергаются validator", async (t) => {
  const { context } = await fixture(t);
  for (const edit of [
    (value: GitMergeContext) =>
      (value.verification.results[0].fingerprint = "0".repeat(64)),
    (value: GitMergeContext) => (value.target.ref = "refs/heads/../main"),
    (value: GitMergeContext) =>
      (value.candidate.approvedChangedPaths = [".env.local"]),
    (value: GitMergeContext) =>
      (value.authorization.actions as string[]).push("push"),
  ]) {
    const value = structuredClone(context);
    edit(value);
    assert.throws(() => validateGitMergeContext(value));
  }
  assert.throws(() => validateGitMergeContext({ ...context, force: true }));
});

test("changed connection, local HEAD и malformed journal не открывают ref writer", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await runGitMerge(f.context, {
        ...f.dependencies,
        resolveConnection: async () => ({
          state: "ready",
          revision: 4,
          repositorySlug: "Owner/Repo",
          token: "fixture-credential",
        }),
      })
    ).errorCode,
    "merge_connection_changed",
  );
  const stale = structuredClone(f.context);
  stale.target.oid = "e".repeat(40);
  stale.verification.results[0].fingerprint = hashGitMergeCandidate(stale);
  assert.equal((await runGitMerge(stale, f.dependencies)).status, "blocked");
  assert.equal(f.creates, 0);
  f.hooks.create = "fail-before";
  await runGitMerge(f.context, f.dependencies);
  const journal = JSON.parse(await readFile(f.journalFile, "utf8"));
  journal.body.parents.reverse();
  await writeFile(f.journalFile, JSON.stringify(journal));
  assert.equal(
    (await runGitMerge(f.context, f.dependencies)).errorCode,
    "merge_journal_invalid",
  );
  assert.equal(f.creates, 1);
  assert.equal(f.updates, 0);
});

test("новые candidate bytes публикуются как blobs/base_tree; локальное полное tree SHA совпадает с Git", async (t) => {
  const f = await fixture(t);
  f.flags.candidateAvailable = false;
  assert.equal(hashGitTree(f.targetTree.tree), f.context.target.treeOid);
  assert.equal(
    hashGitTree(
      applyGitTreeChanges(f.targetTree.tree, f.context.candidate.files),
    ),
    f.context.candidate.treeOid,
  );
  const result = await runGitMerge(f.context, f.dependencies);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(f.blobs, 1);
  assert.equal(f.trees, 1);
  assert.equal(f.creates, 1);
  assert.equal(f.updates, 1);
});

test("Git tree byte sorting nested directories/Unicode соответствует Git и snapshot допускает lockfile >1MiB", async (t) => {
  const f = await fixture(t);
  const blob = (
    await f.git.run(["hash-object", "-w", "--stdin"], {
      input: "sort fixture\n",
    })
  ).trim();
  assert.equal(blob, hashGitBlob(Buffer.from("sort fixture\n")));
  const child = (
    await f.git.run(["mktree"], { input: `100644 blob ${blob}\tβ.txt\n` })
  ).trim();
  const expected = (
    await f.git.run(["mktree"], {
      input: `100644 blob ${blob}\ta.c\n040000 tree ${child}\ta\n100755 blob ${blob}\tz.txt\n`,
    })
  ).trim();
  assert.equal(
    hashGitTree([
      { path: "a.c", mode: "100644", type: "blob", sha: blob },
      { path: "a/β.txt", mode: "100644", type: "blob", sha: blob },
      { path: "z.txt", mode: "100755", type: "blob", sha: blob },
    ]),
    expected,
  );
  const bytes = Buffer.alloc(1024 * 1024 + 1, "a");
  await writeFile(join(f.context.candidateSourceRoot, "owned.txt"), bytes);
  f.context.candidate.files[0].blobOid = hashGitBlob(bytes);
  f.context.candidate.treeOid = hashGitTree(
    applyGitTreeChanges(f.targetTree.tree, f.context.candidate.files),
  );
  f.context.verification.results[0].fingerprint = hashGitMergeCandidate(
    f.context,
  );
  const { readGitMergeCandidate } =
    await import("../src/merge/readGitMergeCandidate.adapter.ts");
  assert.deepEqual((await readGitMergeCandidate(f.context))[0].bytes, bytes);
});

for (const failure of [
  "blob-before",
  "blob-after",
  "tree-before",
  "tree-after",
] as const)
  test(`${failure}: immutable upload неизвестный исход не повторяет POST`, async (t) => {
    const f = await fixture(t);
    f.flags.candidateAvailable = false;
    f.hooks[failure.startsWith("blob") ? "blob" : "tree"] = failure.endsWith(
      "before",
    )
      ? "fail-before"
      : "fail-after";
    const first = await runGitMerge(f.context, f.dependencies);
    assert.equal(first.status, "partial", JSON.stringify(first));
    assert.equal(first.mergeStatus, "unknown");
    assert.equal(f.updates, 0);
    f.hooks.blob = "ok";
    f.hooks.tree = "ok";
    const second = await runGitMerge(f.context, f.dependencies);
    assert.equal(f.blobs, 1);
    assert.equal(f.trees, failure === "blob-before" ? 0 : 1);
    assert.equal(
      second.status,
      failure.endsWith("after") ? "succeeded" : "blocked",
      JSON.stringify(second),
    );
  });

for (const variant of ["bytes", "symlink", "secret", "outside"] as const)
  test(`${variant}: candidate scope/bytes блокируются до любых API POST`, async (t) => {
    const f = await fixture(t);
    if (variant === "outside") {
      f.context.candidateSourceRoot = f.root;
      f.context.verification.results[0].fingerprint = hashGitMergeCandidate(
        f.context,
      );
    } else if (variant === "symlink") {
      await rm(join(f.context.candidateSourceRoot, "owned.txt"));
      await symlink(
        join(f.root, "owned.txt"),
        join(f.context.candidateSourceRoot, "owned.txt"),
      );
    } else {
      const bytes =
        variant === "secret"
          ? Buffer.from(["-----BEGIN ", "PRIVATE KEY-----\nfixture\n"].join(""))
          : Buffer.from("unaccepted bytes\n");
      await writeFile(join(f.context.candidateSourceRoot, "owned.txt"), bytes);
      if (variant === "secret") {
        f.context.candidate.files[0].blobOid = hashGitBlob(bytes);
        f.context.candidate.treeOid = hashGitTree(
          applyGitTreeChanges(f.targetTree.tree, f.context.candidate.files),
        );
        f.context.verification.results[0].fingerprint = hashGitMergeCandidate(
          f.context,
        );
      }
    }
    const result = await runGitMerge(f.context, f.dependencies);
    assert.equal(result.status, "blocked", JSON.stringify(result));
    if (variant === "secret") assert.equal(result.errorCode, "secret_detected");
    assert.equal(f.blobs, 0);
    assert.equal(f.trees, 0);
    assert.equal(f.creates, 0);
    assert.equal(f.updates, 0);
  });
