/**
 * @file .ai/tools/git-delivery/test/manageBehavior.test.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет реальные локальные Git-переходы manage и безопасный recovery во временных fixtures.
 */
import { FixtureGit } from "./fixtures/FixtureGit.adapter.ts";
import assert from "node:assert/strict";
import {
  access,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { Git } from "@realize/git-runtime";
import type {
  GitManageContext,
  GitManageOperation,
  GitManageResult,
} from "../src/manage/GitManage.types.ts";
import { runGitManage } from "../src/manage/runGitManage.service.ts";
import { createDeliveryFixture } from "./fixtures/createDeliveryFixture.adapter.ts";

async function managed(
  f: Awaited<ReturnType<typeof createDeliveryFixture>>,
  operation: GitManageOperation,
  requestId = "manage-1",
): Promise<GitManageContext> {
  return {
    version: 1,
    requestId,
    taskId: "fixture-task",
    projectId: "fixture-project",
    repositoryRoot: f.root,
    authorization: { actions: ["manage"], scope: { mode: "repository" } },
    operation,
    expected: {
      head: await f.head(),
      branch: (await f.git.run(["symbolic-ref", "--short", "HEAD"])).trim(),
    },
  };
}
function blocked(result: GitManageResult, code: string) {
  assert.equal(result.status, "blocked", JSON.stringify(result));
  assert.equal(result.errorCode, code);
  assert.equal(result.details, undefined);
}

test("read branches/log/worktrees не создаёт journal и сохраняет индекс", async (t) => {
  const f = await createDeliveryFixture(t);
  const index = await f.index();
  for (const operation of [
    { kind: "branches-list" },
    { kind: "log", limit: 1 },
    { kind: "worktree-list" },
  ] as GitManageOperation[]) {
    const context = await managed(f, operation);
    delete context.expected;
    const result = await runGitManage(context);
    assert.equal(result.status, "succeeded", JSON.stringify(result));
    assert.equal(result.details!.kind, operation.kind);
  }
  await assert.rejects(access(join(f.root, ".ai-workspace")));
  assert.deepEqual(await f.index(), index);
});

test("repository root, symlink и stale HEAD блокируются до mutation", async (t) => {
  const f = await createDeliveryFixture(t);
  const context = await managed(f, {
    kind: "branch-create",
    name: "topic",
    switch: false,
  });
  blocked(
    await runGitManage({
      ...context,
      expected: { ...context.expected, head: "a".repeat(40) },
    }),
    "manage_repository_changed",
  );
  const sub = join(f.root, "sub");
  await mkdir(sub);
  blocked(
    await runGitManage({ ...context, repositoryRoot: sub }),
    "manage_repository_invalid",
  );
  const alias = join(f.temporary, "alias");
  await symlink(f.root, alias);
  blocked(
    await runGitManage({ ...context, repositoryRoot: alias }),
    "manage_repository_invalid",
  );
  assert.equal((await f.git.run(["branch", "--list", "topic"])).trim(), "");
});

test("remote URL exact CAS меняет только запрошенный URL и replay noops", async (t) => {
  const f = await createDeliveryFixture(t);
  const old = "https://github.com/Owner/Old.git";
  const url = "https://github.com/Owner/New.git";
  await f.git.run(["remote", "add", "origin", old]);
  await f.git.run(["remote", "add", "other", old]);
  const context = await managed(f, {
    kind: "remote-set-url",
    remote: "origin",
    expectedURL: old,
    url,
  });
  const result = await runGitManage(context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal((await f.git.run(["remote", "get-url", "origin"])).trim(), url);
  assert.equal((await f.git.run(["remote", "get-url", "other"])).trim(), old);
  assert.equal((await runGitManage(context)).status, "noop");
  blocked(
    await runGitManage({
      ...context,
      operation: {
        ...context.operation,
        url: "https://github.com/Owner/Else.git",
      },
    }),
    "request_conflict",
  );
});

test("remote rejects mismatched CAS, multiple URLs and independently configured old pushurl", async (t) => {
  const f = await createDeliveryFixture(t);
  const old = "git@github.com:Owner/Old.git";
  const url = "git@github.com:Owner/New.git";
  await f.git.run(["remote", "add", "origin", old]);
  const context = await managed(f, {
    kind: "remote-set-url",
    remote: "origin",
    expectedURL: old,
    url,
  });
  blocked(
    await runGitManage({
      ...context,
      operation: {
        ...context.operation,
        expectedURL: "git@github.com:Owner/Wrong.git",
      },
    }),
    "manage_remote_changed",
  );
  await f.git.run(["config", "--local", "remote.origin.pushurl", old]);
  blocked(await runGitManage(context), "manage_push_url_conflict");
  await f.git.run([
    "config",
    "--local",
    "--unset-all",
    "remote.origin.pushurl",
  ]);
  await f.git.run(["config", "--local", "--add", "remote.origin.url", old]);
  blocked(await runGitManage(context), "manage_remote_changed");
  assert.equal((await f.git.run(["remote", "get-url", "origin"])).trim(), old);
});

test("branch create/switch сохраняют commit и блокируют dirty repository", async (t) => {
  const f = await createDeliveryFixture(t);
  const create = await managed(f, {
    kind: "branch-create",
    name: "feature/topic",
    switch: true,
  });
  await f.write("owned.txt", "uncommitted\n");
  blocked(await runGitManage(create), "manage_dirty_repository");
  await f.write("owned.txt", "owned baseline\n");
  const result = await runGitManage(create);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.branch, "feature/topic");
  assert.equal(result.commit, create.expected!.head);
  assert.equal((await runGitManage(create)).status, "noop");
  const switchContext = await managed(
    f,
    { kind: "branch-switch", name: "main" },
    "manage-2",
  );
  assert.equal((await runGitManage(switchContext)).status, "succeeded");
  assert.equal((await runGitManage(switchContext)).status, "noop");
  blocked(await runGitManage(create), "manage_recovery_conflict");
});

test("failed branch switch after partial ref creation is not blindly replayed", async (t) => {
  const f = await createDeliveryFixture(t);
  const context = await managed(f, {
    kind: "branch-create",
    name: "topic",
    switch: true,
  });
  const original = Git.prototype.run;
  const mock = t.mock.method(
    Git.prototype,
    "run",
    async function (
      this: Git,
      args: string[],
      options?: Parameters<Git["run"]>[1],
    ) {
      if (args.includes("--create")) {
        await original.call(this, ["branch", "topic", context.expected!.head]);
        throw new Error("interrupted fixture");
      }
      return original.call(this, args, options);
    },
  );
  const interrupted = await runGitManage(context);
  assert.equal(interrupted.status, "partial");
  mock.mock.restore();
  blocked(await runGitManage(context), "manage_recovery_conflict");
  assert.equal(
    (await f.git.run(["symbolic-ref", "--short", "HEAD"])).trim(),
    "main",
  );
});

test("write завершённый до сбоя journal восстанавливается без повторной mutation", async (t) => {
  const f = await createDeliveryFixture(t);
  const context = await managed(f, {
    kind: "branch-create",
    name: "topic",
    switch: false,
  });
  assert.equal((await runGitManage(context)).status, "succeeded");
  const journalPath = join(
    f.root,
    ".ai-workspace/tasks/fixture-task/logs/git-delivery/manage-1.json",
  );
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  journal.phase = "prepared";
  await writeFile(journalPath, JSON.stringify(journal));
  assert.equal((await runGitManage(context)).status, "noop");
  assert.equal(
    JSON.parse(await readFile(journalPath, "utf8")).phase,
    "completed",
  );
});

test("repair переносит main-root links только для зарегистрированного exact external worktree", async (t) => {
  const f = await createDeliveryFixture(t);
  const external = join(f.temporary, "external");
  const foreign = join(f.temporary, "foreign-worktree");
  await f.git.run(["worktree", "add", "-b", "external", external]);
  await f.git.run(["worktree", "add", "-b", "foreign", foreign]);
  const foreignPointer = await readFile(join(foreign, ".git"), "utf8");
  const moved = join(f.temporary, "moved-main");
  await rename(f.root, moved);
  f.root = moved;
  f.git.root = moved;
  const context = await managed(f, {
    kind: "worktree-repair",
    paths: [external],
  });
  context.authorization.externalWorktrees = [external];
  blocked(await runGitManage(context), "manage_worktree_scope_invalid");
  assert.equal(await readFile(join(foreign, ".git"), "utf8"), foreignPointer);
  context.operation = { kind: "worktree-repair", paths: [external, foreign] };
  context.authorization.externalWorktrees = [external, foreign];
  const result = await runGitManage(context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  const pointer = await readFile(join(external, ".git"), "utf8");
  assert.ok(pointer.startsWith(`gitdir: ${moved}/.git/worktrees/`));
  assert.equal(
    (await new FixtureGit(external).run(["rev-parse", "HEAD"])).trim(),
    context.expected!.head,
  );
  assert.equal((await runGitManage(context)).status, "noop");
  assert.ok(
    (await readFile(join(foreign, ".git"), "utf8")).startsWith(
      `gitdir: ${moved}/.git/worktrees/`,
    ),
  );
});

test("repair rejects outside registration and symlink paths", async (t) => {
  const f = await createDeliveryFixture(t);
  const outside = join(f.temporary, "outside");
  await mkdir(outside);
  await writeFile(
    join(outside, ".git"),
    "gitdir: /outside/.git/worktrees/fake\n",
  );
  const context = await managed(f, {
    kind: "worktree-repair",
    paths: [outside],
  });
  context.authorization.externalWorktrees = [outside];
  const result = await runGitManage(context);
  assert.ok(["blocked", "failed"].includes(result.status));
  assert.equal(result.details, undefined);
  const alias = join(f.temporary, "alias");
  await symlink(outside, alias);
  context.operation = { kind: "worktree-repair", paths: [alias] };
  context.authorization.externalWorktrees = [alias];
  blocked(await runGitManage(context), "manage_worktree_invalid");
  assert.equal(
    await readFile(join(outside, ".git"), "utf8"),
    "gitdir: /outside/.git/worktrees/fake\n",
  );
});

test("diff bound and secret guard не возвращают частичный raw content", async (t) => {
  const f = await createDeliveryFixture(t);
  await f.write("owned.txt", "changed literal\n");
  const context = await managed(f, {
    kind: "diff",
    scope: "working-tree",
    paths: ["owned.txt"],
    contextLines: 3,
    limitBytes: 4096,
  });
  const result = await runGitManage(context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.ok(
    result.details?.kind === "diff" &&
      result.details.patch.includes("+changed literal"),
  );
  blocked(
    await runGitManage({
      ...context,
      operation: { ...context.operation, limitBytes: 1 },
    }),
    "manage_output_limit",
  );
  const secret = "ghp_" + "A".repeat(40);
  await f.write("owned.txt", secret + "\n");
  const denied = await runGitManage(context);
  blocked(denied, "secret_detected");
  assert.ok(!JSON.stringify(denied).includes(secret));
});

test("working diff не исполняет clean filter или external diff", async (t) => {
  const f = await createDeliveryFixture(t);
  const marker = join(f.temporary, "filter-executed");
  await writeFile(
    join(f.root, ".gitattributes"),
    "owned.txt filter=evil diff=evil\n",
  );
  await f.git.run([
    "config",
    "--local",
    "filter.evil.clean",
    `touch ${marker}; cat`,
  ]);
  await f.git.run([
    "config",
    "--local",
    "diff.evil.command",
    `touch ${marker}`,
  ]);
  await f.write("owned.txt", "literal text\n");
  const result = await runGitManage(
    await managed(f, {
      kind: "diff",
      scope: "working-tree",
      paths: ["owned.txt"],
      contextLines: 1,
      limitBytes: 4096,
    }),
  );
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  await assert.rejects(access(marker));
});

test("diff rejects ancestor symlink and log protects commit subjects", async (t) => {
  const f = await createDeliveryFixture(t);
  const sub = join(f.root, "sub");
  await mkdir(sub);
  await writeFile(join(sub, "tracked.txt"), "baseline\n");
  await f.git.run(["add", "sub/tracked.txt"]);
  await f.git.run(["commit", "--message", "Add tracked nested fixture"]);
  const realSub = join(f.temporary, "outside");
  await rename(sub, realSub);
  await symlink(realSub, sub);
  blocked(
    await runGitManage(
      await managed(f, {
        kind: "diff",
        scope: "working-tree",
        paths: ["sub/tracked.txt"],
        contextLines: 1,
        limitBytes: 4096,
      }),
    ),
    "manage_diff_content_invalid",
  );
  const secret = "ghp_" + "B".repeat(40);
  await f.git.run(["commit", "--allow-empty", "--message", secret]);
  const result = await runGitManage(
    await managed(f, { kind: "log", limit: 1 }),
  );
  blocked(result, "secret_detected");
  assert.ok(!JSON.stringify(result).includes(secret));
});

test("index diff читает staged bytes и сохраняет index и working files", async (t) => {
  const f = await createDeliveryFixture(t);
  await f.write("owned.txt", "staged version\n");
  await f.git.run(["add", "owned.txt"]);
  await f.write("owned.txt", "unstaged version\n");
  const index = await f.index();
  const result = await runGitManage(
    await managed(f, {
      kind: "diff",
      scope: "index",
      paths: ["owned.txt"],
      contextLines: 1,
      limitBytes: 4096,
    }),
  );
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.ok(
    result.details?.kind === "diff" &&
      result.details.patch.includes("+staged version"),
  );
  assert.ok(!JSON.stringify(result).includes("unstaged version"));
  assert.deepEqual(await f.index(), index);
  assert.equal(
    await readFile(join(f.root, "owned.txt"), "utf8"),
    "unstaged version\n",
  );
});

test("working diff показывает mode-only change без content hunks", async (t) => {
  const f = await createDeliveryFixture(t);
  await chmod(join(f.root, "owned.txt"), 0o755);
  const result = await runGitManage(
    await managed(f, {
      kind: "diff",
      scope: "working-tree",
      paths: ["owned.txt"],
      contextLines: 1,
      limitBytes: 4096,
    }),
  );
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.ok(
    result.details?.kind === "diff" &&
      result.details.patch.includes("old mode 100644\nnew mode 100755"),
  );
});

test("tampered journal не назначает новую ветку или разрешённый after", async (t) => {
  const f = await createDeliveryFixture(t);
  const context = await managed(f, {
    kind: "branch-create",
    name: "topic",
    switch: false,
  });
  assert.equal((await runGitManage(context)).status, "succeeded");
  const path = join(
    f.root,
    ".ai-workspace/tasks/fixture-task/logs/git-delivery/manage-1.json",
  );
  const journal = JSON.parse(await readFile(path, "utf8"));
  journal.after.branch = "other";
  await writeFile(path, JSON.stringify(journal));
  blocked(await runGitManage(context), "invalid_journal");
  assert.equal(
    (await f.git.run(["symbolic-ref", "--short", "HEAD"])).trim(),
    "main",
  );
});

test("write требует ignored journal до создания operation files", async (t) => {
  const f = await createDeliveryFixture(t);
  await f.write(".gitignore", "");
  const result = await runGitManage(
    await managed(f, { kind: "branch-create", name: "topic", switch: false }),
  );
  blocked(result, "journal_not_ignored");
  await assert.rejects(access(join(f.root, ".ai-workspace")));
  assert.equal((await f.git.run(["branch", "--list", "topic"])).trim(), "");
});

test("branch management не принимает hidden index flags и сохраняет скрытые bytes", async (t) => {
  for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
    await t.test(flag, async (child) => {
      const f = await createDeliveryFixture(child);
      await f.git.run(["update-index", flag, "owned.txt"]);
      await f.write("owned.txt", "hidden local bytes\n");
      const before = await f.index();
      blocked(
        await runGitManage(
          await managed(f, {
            kind: "branch-create",
            name: "topic",
            switch: false,
          }),
        ),
        "manage_hidden_index_flags",
      );
      assert.equal(
        await readFile(join(f.root, "owned.txt"), "utf8"),
        "hidden local bytes\n",
      );
      assert.deepEqual(await f.index(), before);
      assert.equal((await f.git.run(["branch", "--list", "topic"])).trim(), "");
    });
  }
});

test("branch management блокирует sequencer и paused rebase markers", async (t) => {
  for (const marker of ["REBASE_HEAD", "REVERT_HEAD", "sequencer"]) {
    await t.test(marker, async (child) => {
      const f = await createDeliveryFixture(child);
      if (marker === "sequencer") await mkdir(join(f.root, ".git", marker));
      else
        await writeFile(join(f.root, ".git", marker), (await f.head()) + "\n");
      blocked(
        await runGitManage(
          await managed(f, {
            kind: "branch-create",
            name: "topic",
            switch: false,
          }),
        ),
        "manage_operation_in_progress",
      );
      assert.equal((await f.git.run(["branch", "--list", "topic"])).trim(), "");
    });
  }
});

test("repair сохраняет missing worktree registrations без prune и не требует отсутствующие paths", async (t) => {
  const f = await createDeliveryFixture(t);
  const external = join(f.temporary, "external");
  const missing = join(f.temporary, "missing");
  await f.git.run(["worktree", "add", "-b", "external", external]);
  await f.git.run(["worktree", "add", "-b", "missing", missing]);
  const registration = join(f.root, ".git/worktrees/missing");
  const preserved = await Promise.all(
    ["HEAD", "commondir", "gitdir"].map((file) =>
      readFile(join(registration, file)),
    ),
  );
  await rm(missing, { recursive: true, force: true });
  const moved = join(f.temporary, "moved-main");
  await rename(f.root, moved);
  f.root = moved;
  f.git.root = moved;
  const context = await managed(f, {
    kind: "worktree-repair",
    paths: [external],
  });
  context.authorization.externalWorktrees = [external];
  const result = await runGitManage(context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  const actual = await Promise.all(
    ["HEAD", "commondir", "gitdir"].map((file) =>
      readFile(join(moved, ".git/worktrees/missing", file)),
    ),
  );
  assert.deepEqual(actual, preserved);
  await assert.rejects(access(missing));
});

test("repair не перехватывает worktree другого существующего repository с matching registration ID", async (t) => {
  const owner = await createDeliveryFixture(t);
  const claimant = await createDeliveryFixture(t);
  const external = join(owner.temporary, "external");
  await owner.git.run(["worktree", "add", "-b", "external", external]);
  const pointer = await readFile(join(external, ".git"), "utf8");
  const ownerRegistration = pointer.trim().slice("gitdir: ".length);
  const registration = join(claimant.root, ".git/worktrees/external");
  await mkdir(registration, { recursive: true });
  for (const file of ["HEAD", "gitdir", "commondir"])
    await writeFile(
      join(registration, file),
      await readFile(join(ownerRegistration, file)),
    );
  const context = await managed(claimant, {
    kind: "worktree-repair",
    paths: [external],
  });
  context.authorization.externalWorktrees = [external];
  blocked(await runGitManage(context), "manage_worktree_invalid");
  assert.equal(await readFile(join(external, ".git"), "utf8"), pointer);
  assert.equal(
    (
      await new FixtureGit(external).run([
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
      ])
    ).trim(),
    join(owner.root, ".git"),
  );
});

test("manage object operations не вызывают promisor remote helper для отсутствующего commit", async (t) => {
  for (const key of ["remote.origin.promisor", "extensions.partialClone"]) {
    await t.test(key, async (child) => {
      const f = await createDeliveryFixture(child);
      const head = await f.head();
      const helper = join(f.temporary, "promisor-helper");
      const marker = join(f.temporary, "helper-called");
      await writeFile(helper, '#!/bin/sh\nprintf called > "$1"\nexit 1\n', {
        mode: 0o700,
      });
      await f.git.run(["remote", "add", "origin", `ext::${helper} ${marker}`]);
      await f.git.run(["config", "--local", "protocol.ext.allow", "always"]);
      await f.git.run([
        "config",
        "--local",
        "core.repositoryformatversion",
        "1",
      ]);
      await f.git.run([
        "config",
        "--local",
        key,
        key === "remote.origin.promisor" ? "true" : "origin",
      ]);
      const operations: GitManageOperation[] = [
        { kind: "log", limit: 1 },
        {
          kind: "diff",
          scope: "index",
          paths: ["owned.txt"],
          contextLines: 1,
          limitBytes: 4096,
        },
        { kind: "branch-create", name: "topic", switch: false },
        { kind: "branch-switch", name: "main" },
      ];
      const contexts = await Promise.all(
        operations.map((operation, index) =>
          managed(f, operation, `partial-clone-${index}`),
        ),
      );
      await rm(join(f.root, ".git/objects", head.slice(0, 2), head.slice(2)));
      // Positive control доказывает, что fixture действительно может исполнить helper через Git lazy fetch.
      await assert.rejects(
        f.git.run(["log", "--max-count=1", "--format=%H", "HEAD"]),
      );
      assert.equal(await readFile(marker, "utf8"), "called");
      await rm(marker);
      for (const context of contexts)
        blocked(
          await runGitManage(context),
          "manage_partial_clone_unavailable",
        );
      await assert.rejects(access(marker));
      await assert.rejects(access(join(f.root, ".ai-workspace")));
      assert.equal((await f.git.run(["branch", "--list", "topic"])).trim(), "");
    });
  }
});
