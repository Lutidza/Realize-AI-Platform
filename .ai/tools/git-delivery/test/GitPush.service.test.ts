/**
 * @file .ai/tools/git-delivery/test/GitPush.service.test.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет разрешения, журналирование и восстановление push во временных Git-репозиториях с тестовой сетью.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { emptyResult, PolicyError } from "../src/contracts.ts";
import { Git } from "../src/Git.adapter.ts";
import { GitJournalRepository } from "../src/GitJournal.repository.ts";
import type { GitNetworkConnection } from "../src/network/GitNetwork.types.ts";
import type {
  GitPushContext,
  GitPushDependencies,
  GitPushJournal,
  GitPushResult,
} from "../src/push/GitPush.types.ts";
import { runGitPush } from "../src/push/runGitPush.service.ts";
import { validateGitPushContext } from "../src/push/validateGitPushContext.validator.ts";
import { GitWorkerCapabilityService } from "../src/worker/GitWorkerCapability.service.ts";

function context(
  root = "/nonexistent-push-validation-fixture",
  source = "c".repeat(40),
  earlier = "b".repeat(40),
  remote = "a".repeat(40),
): GitPushContext {
  const assigned: GitPushContext = {
    version: 1,
    requestId: "push-request",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: root,
    authorization: {
      actions: ["push"],
      scope: { mode: "commits", commits: [source, earlier] },
    },
    target: {
      connectionKey: "github:primary",
      connectionRevision: 7,
      repositorySlug: "fixture-owner/fixture-repository",
      transport: "https",
      branch: "main",
      sourceOid: source,
      remoteOid: remote,
    },
    verification: {
      requiredChecks: ["fixture-review", "fixture-types"],
      results: [],
    },
  };
  attest(assigned);
  return assigned;
}

// Результаты проверок являются тестовыми данными доверенной границы, а не выполненными проверками fixture-кода.
function attest(assigned: GitPushContext): void {
  assigned.verification.results = assigned.authorization.scope.commits.flatMap(
    (commit) =>
      assigned.verification.requiredChecks.map((id) => ({
        id,
        commit,
        status: "passed" as const,
      })),
  );
}

async function fixture(t: TestContext) {
  const temporary = await mkdtemp(join(tmpdir(), "realize-git-push-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "repository");
  const hooks = join(temporary, "hooks");
  await mkdir(root);
  await mkdir(hooks);
  const git = new Git(root);
  await git.run(["init", "--initial-branch=main", "--template="]);
  for (const [key, value] of Object.entries({
    "core.hooksPath": hooks,
    "commit.gpgSign": "false",
    "core.autocrlf": "false",
    "core.safecrlf": "false",
    "core.excludesFile": "/dev/null",
    "core.attributesFile": "/dev/null",
    "user.name": "Fixture Author",
    "user.email": "fixture@example.invalid",
  }))
    await git.run(["config", "--local", key, value]);
  await writeFile(join(root, ".gitignore"), "/.ai-workspace/tasks/\n");
  await writeFile(join(root, "owned.txt"), "baseline\n");
  await writeFile(join(root, "foreign.txt"), "foreign baseline\n");
  await git.run(["add", "--all"]);
  await git.run(["commit", "--message", "Initial isolated push fixture"]);
  const head = async () => (await git.run(["rev-parse", "HEAD"])).trim();
  const remote = await head();
  await writeFile(join(root, "owned.txt"), "earlier unpublished change\n");
  await git.run(["add", "--", "owned.txt"]);
  await git.run(["commit", "--message", "Earlier unpublished fixture"]);
  const earlier = await head();
  await writeFile(join(root, "owned.txt"), "assigned source change\n");
  await git.run(["add", "--", "owned.txt"]);
  await git.run(["commit", "--message", "Assigned fixture source"]);
  const source = await head();
  const assigned = context(root, source, earlier, remote);
  const repository = new GitJournalRepository(assigned);
  const journal = async () =>
    (await repository.load()) as GitPushJournal | null;
  const connection: GitNetworkConnection = {
    state: "ready",
    connectionKey: "github:primary",
    revision: 7,
    repositorySlug: assigned.target.repositorySlug,
    repositoryURL: "https://github.com/fixture-owner/fixture-repository.git",
    transport: "https",
    token: "synthetic-fixture-token",
  };
  const calls = { resolve: 0, create: 0, read: 0, push: 0, close: 0 };
  const network = {
    remote: remote as string | null,
    async readRemoteHead() {
      calls.read += 1;
      return network.remote;
    },
    async push() {
      calls.push += 1;
      assert.equal(
        (await journal())?.phase,
        "sending",
        "Журнал должен сохраняться до сетевой записи.",
      );
      network.remote = source;
    },
    async close() {
      calls.close += 1;
    },
  };
  const dependencies: GitPushDependencies = {
    async resolveConnection() {
      calls.resolve += 1;
      return structuredClone(connection);
    },
    async createNetwork(receivedGit, receivedConnection, target) {
      calls.create += 1;
      assert.equal(receivedGit.root, root);
      assert.deepEqual(receivedConnection, connection);
      assert.deepEqual(target, assigned.target);
      return network;
    },
  };
  return {
    root,
    git,
    context: assigned,
    earlier,
    source,
    remote,
    head,
    repository,
    journal,
    connection,
    calls,
    network,
    dependencies,
  };
}

function blocked(result: GitPushResult, code: string): void {
  assert.equal(result.status, "blocked", JSON.stringify(result));
  assert.equal(result.errorCode, code);
  assert.equal(result.commitCreated, false);
}

test("push охватывает ранний commit, сохраняет чужой индекс и файлы, повтор не отправляет снова", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.root, "foreign.txt"), "foreign staged\n");
  await f.git.run(["add", "--", "foreign.txt"]);
  await writeFile(join(f.root, "foreign.txt"), "foreign unstaged\n");
  await writeFile(join(f.root, "owned.txt"), "later local change\n");
  await writeFile(join(f.root, "untracked.txt"), "untracked local file\n");
  const indexPath = join(f.root, ".git", "index");
  const indexBefore = await readFile(indexPath);
  const result = await runGitPush(f.context, f.dependencies);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.pushStatus, "succeeded");
  assert.equal(result.remoteCommit, f.source);
  assert.equal(result.commitCreated, false);
  assert.deepEqual(result.checks, [
    { id: "fixture-review", status: "passed", reused: true },
    { id: "fixture-types", status: "passed", reused: true },
  ]);
  assert.deepEqual((await f.journal())?.commits, [f.source, f.earlier]);
  assert.equal((await f.journal())?.phase, "succeeded");
  assert.deepEqual(f.calls, {
    resolve: 2,
    create: 1,
    read: 2,
    push: 1,
    close: 1,
  });
  const replay = await runGitPush(f.context, f.dependencies);
  assert.equal(replay.status, "noop", JSON.stringify(replay));
  assert.equal(replay.pushStatus, "succeeded");
  assert.equal(f.calls.push, 1);
  assert.equal(f.calls.close, 2);
  assert.equal(await f.head(), f.source);
  assert.equal(
    (await f.git.run(["symbolic-ref", "HEAD"])).trim(),
    "refs/heads/main",
  );
  assert.deepEqual(await readFile(indexPath), indexBefore);
  assert.equal(
    await readFile(join(f.root, "foreign.txt"), "utf8"),
    "foreign unstaged\n",
  );
  assert.equal(
    await readFile(join(f.root, "owned.txt"), "utf8"),
    "later local change\n",
  );
  assert.equal(
    await readFile(join(f.root, "untracked.txt"), "utf8"),
    "untracked local file\n",
  );
});

test("область должна точно покрывать все исходящие коммиты", async (t) => {
  for (const mode of ["missing-earlier", "extra-ancestor"] as const) {
    await t.test(mode, async (child) => {
      const f = await fixture(child);
      f.context.authorization.scope.commits =
        mode === "missing-earlier"
          ? [f.source]
          : [f.source, f.earlier, f.remote];
      attest(f.context);
      blocked(
        await runGitPush(f.context, f.dependencies),
        "push_scope_mismatch",
      );
      assert.equal(f.calls.resolve, 0);
      assert.equal(f.calls.push, 0);
      assert.equal(await f.journal(), null);
    });
  }
});

test("replace refs, grafts и shallow блокируются до сети и при появлении перед отправкой", async (t) => {
  for (const timing of ["before", "before-send"] as const) {
    for (const mode of ["replace", "grafts", "shallow"] as const) {
      await t.test(`${timing}-${mode}`, async (child) => {
        const f = await fixture(child);
        const mutate = async () => {
          if (mode === "replace") {
            const tree = (
              await f.git.run(["rev-parse", `${f.source}^{tree}`])
            ).trim();
            const replacement = (
              await f.git.run([
                "commit-tree",
                tree,
                "-p",
                f.remote,
                "-m",
                "Fixture with hidden earlier parent",
              ])
            ).trim();
            await f.git.run(["replace", f.source, replacement]);
          } else if (mode === "grafts") {
            await mkdir(join(f.root, ".git", "info"), { recursive: true });
            await writeFile(
              join(f.root, ".git", "info", "grafts"),
              `${f.source} ${f.remote}\n`,
            );
          } else {
            await writeFile(join(f.root, ".git", "shallow"), `${f.earlier}\n`);
          }
        };
        if (timing === "before") {
          await mutate();
          if (mode === "replace") {
            // Воспроизводит обход: обычный rev-list скрывает commit, отсутствующий в разрешении.
            f.context.authorization.scope.commits = [f.source];
            attest(f.context);
            assert.deepEqual(
              (await f.git.run(["rev-list", f.source, "--not", f.remote]))
                .trim()
                .split("\n"),
              [f.source],
            );
            assert.deepEqual(
              (
                await f.git.run([
                  "--no-replace-objects",
                  "rev-list",
                  f.source,
                  "--not",
                  f.remote,
                ])
              )
                .trim()
                .split("\n"),
              [f.source, f.earlier],
            );
          }
        } else {
          const resolve = f.dependencies.resolveConnection;
          f.dependencies.resolveConnection = async () => {
            const connection = await resolve();
            if (f.calls.resolve === 2) await mutate();
            return connection;
          };
        }
        blocked(
          await runGitPush(f.context, f.dependencies),
          "push_history_unsupported",
        );
        assert.equal(f.calls.push, 0);
        assert.equal(f.calls.create, timing === "before" ? 0 : 1);
        assert.equal(f.calls.close, timing === "before" ? 0 : 1);
        assert.equal(
          (await f.journal())?.phase ?? null,
          timing === "before" ? null : "prepared",
        );
      });
    }
  }
});

test("HEAD и ветка проверяются при входе и повторно перед отправкой", async (t) => {
  for (const timing of ["before", "before-send"] as const) {
    for (const change of ["head", "branch"] as const) {
      await t.test(`${timing}-${change}`, async (child) => {
        const f = await fixture(child);
        const mutate = async () => {
          if (change === "head")
            await f.git.run(["update-ref", "refs/heads/main", f.earlier]);
          else {
            await f.git.run(["update-ref", "refs/heads/other", f.source]);
            await f.git.run(["symbolic-ref", "HEAD", "refs/heads/other"]);
          }
        };
        if (timing === "before") await mutate();
        else {
          const resolve = f.dependencies.resolveConnection;
          f.dependencies.resolveConnection = async () => {
            const connection = await resolve();
            if (f.calls.resolve === 2) await mutate();
            return connection;
          };
        }
        blocked(
          await runGitPush(f.context, f.dependencies),
          "push_source_changed",
        );
        assert.equal(f.calls.push, 0);
        assert.equal(f.calls.close, timing === "before" ? 0 : 1);
        assert.equal(
          (await f.journal())?.phase ?? null,
          timing === "before" ? null : "prepared",
        );
      });
    }
  }
});

test("неполные, проваленные и дублированные проверки отклоняются до Git и сети", async (t) => {
  for (const mode of [
    "no-required",
    "missing",
    "failed",
    "duplicate",
    "stale",
  ] as const) {
    await t.test(mode, async () => {
      const assigned = context();
      if (mode === "no-required") assigned.verification.requiredChecks = [];
      if (mode === "missing") assigned.verification.results.pop();
      if (mode === "failed")
        assigned.verification.results[0]!.status = "failed";
      if (mode === "duplicate")
        assigned.verification.results[1] = {
          ...assigned.verification.results[0]!,
        };
      if (mode === "stale")
        assigned.verification.results[0]!.commit = "d".repeat(40);
      const code =
        mode === "no-required" ? "checks_required" : "checks_stale_or_missing";
      assert.throws(() => validateGitPushContext(assigned), { code });
      const result = await runGitPush(assigned, {
        async resolveConnection() {
          assert.fail("Подключение до валидации запрещено.");
        },
        async createNetwork() {
          assert.fail("Сетевая сессия до валидации запрещена.");
        },
      });
      blocked(result, code);
    });
  }
});

test("отсутствующее подключение и изменение ревизии между чтениями блокируют push", async (t) => {
  for (const mode of ["absent", "disabled", "revision-drift"] as const) {
    await t.test(mode, async (child) => {
      const f = await fixture(child);
      const resolve = f.dependencies.resolveConnection;
      f.dependencies.resolveConnection = async () => {
        const connection = await resolve();
        if (mode !== "revision-drift") return { state: mode };
        return f.calls.resolve === 2 && connection.state === "ready"
          ? { ...connection, revision: connection.revision + 1 }
          : connection;
      };
      blocked(
        await runGitPush(f.context, f.dependencies),
        mode === "revision-drift"
          ? "connection_changed"
          : "connection_unavailable",
      );
      assert.equal(f.calls.push, 0);
      assert.equal(f.calls.close, mode === "revision-drift" ? 1 : 0);
      assert.equal(
        (await f.journal())?.phase ?? null,
        mode === "revision-drift" ? "prepared" : null,
      );
    });
  }
});

test("другая удалённая версия не получает push", async (t) => {
  const f = await fixture(t);
  f.network.remote = f.earlier;
  blocked(await runGitPush(f.context, f.dependencies), "push_remote_changed");
  assert.equal(f.calls.push, 0);
  assert.equal(f.calls.close, 1);
  assert.equal(await f.journal(), null);
});

test("уже назначенный remote возвращает noop без первой отправки", async (t) => {
  const f = await fixture(t);
  f.network.remote = f.source;
  const result = await runGitPush(f.context, f.dependencies);
  assert.equal(result.status, "noop", JSON.stringify(result));
  assert.equal(result.pushStatus, "succeeded");
  assert.equal(result.remoteCommit, f.source);
  assert.equal((await f.journal())?.phase, "succeeded");
  assert.equal(f.calls.push, 0);
  assert.equal(f.calls.close, 1);
});

test("обрыв после изменения remote восстанавливается как noop без второй отправки", async (t) => {
  const f = await fixture(t);
  const push = f.network.push;
  f.network.push = async () => {
    await push();
    throw new Error("Synthetic transport failure after remote update");
  };
  const first = await runGitPush(f.context, f.dependencies);
  assert.equal(first.status, "partial", JSON.stringify(first));
  assert.equal(first.pushStatus, "unknown");
  assert.equal((await f.journal())?.phase, "unknown");
  const retry = await runGitPush(f.context, f.dependencies);
  assert.equal(retry.status, "noop", JSON.stringify(retry));
  assert.equal(retry.pushStatus, "succeeded");
  assert.equal(retry.remoteCommit, f.source);
  assert.equal((await f.journal())?.phase, "succeeded");
  assert.equal(f.calls.push, 1);
  assert.equal(f.calls.close, 2);
});

test("обрыв без изменения remote блокирует повтор неизвестной отправки", async (t) => {
  const f = await fixture(t);
  f.network.push = async () => {
    f.calls.push += 1;
    assert.equal((await f.journal())?.phase, "sending");
    throw new Error("Synthetic transport failure before remote update");
  };
  const first = await runGitPush(f.context, f.dependencies);
  assert.equal(first.status, "partial", JSON.stringify(first));
  assert.equal(first.pushStatus, "unknown");
  assert.equal((await f.journal())?.phase, "unknown");
  const retry = await runGitPush(f.context, f.dependencies);
  blocked(retry, "push_outcome_unknown");
  assert.equal(retry.pushStatus, "unknown");
  assert.equal(f.calls.push, 1);
  assert.equal(f.calls.close, 2);
  assert.equal(f.network.remote, f.remote);
});

test("другое разрешение с прежним requestId конфликтует с журналом", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await runGitPush(f.context, f.dependencies)).status,
    "succeeded",
  );
  const journalBefore = await f.journal();
  const callsBefore = { ...f.calls };
  f.context.target.connectionRevision += 1;
  blocked(await runGitPush(f.context, f.dependencies), "request_conflict");
  assert.deepEqual(f.calls, callsBefore);
  assert.deepEqual(await f.journal(), journalBefore);
});

function capabilityResult(): GitPushResult {
  return {
    ...emptyResult(),
    requestId: "push-request",
    action: "push",
    status: "succeeded",
    pushStatus: "succeeded",
    remoteCommit: "c".repeat(40),
  };
}

function pushRequest(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    threadId: "push-thread",
    turnId: "push-turn",
    callId: "push-call",
    tool: "git_push",
    arguments: {},
    ...overrides,
  };
}

function bind(capability: GitWorkerCapabilityService): void {
  capability.threadId = "push-thread";
  capability.turnId = "push-turn";
}

test("push capability открывает только назначенный вызов и сохраняет независимый контекст", async () => {
  const assigned = context();
  const expected = structuredClone(assigned);
  const result = capabilityResult();
  const capability = new GitWorkerCapabilityService(
    { action: "push" },
    assigned,
    async (command, received) => {
      assert.deepEqual(command, { action: "push" });
      assert.deepEqual(received, expected);
      return result;
    },
  );
  bind(capability);
  assigned.target.branch = "other";
  assigned.authorization.scope.commits = [];
  assigned.verification.results = [];
  assert.deepEqual(
    capability.tools.map((tool) => tool.name),
    ["git_push"],
  );
  assert.deepEqual(capability.tools[0]!.inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  assert.deepEqual(await capability.handle("item/tool/call", pushRequest()), {
    contentItems: [{ type: "inputText", text: JSON.stringify(result) }],
    success: true,
  });
  assert.strictEqual(await capability.getResult(), result);
});

test("аргументы модели и подмена инструмента не расширяют push capability", async (t) => {
  for (const input of [
    pushRequest({ arguments: { branch: "other", force: true } }),
    pushRequest({
      arguments: { action: "commit", repositoryRoot: "/foreign" },
    }),
    pushRequest({ tool: "git_commit" }),
    pushRequest({ tool: "git_inspect" }),
  ]) {
    await t.test(
      String(input.tool) + JSON.stringify(input.arguments),
      async () => {
        const capability = new GitWorkerCapabilityService(
          { action: "push" },
          context(),
          async () => assert.fail("Запрещённый запрос не вызывает handler."),
        );
        bind(capability);
        const denied = (error: unknown) =>
          error instanceof PolicyError &&
          error.code === "worker_capability_denied";
        await assert.rejects(
          capability.handle("item/tool/call", input),
          denied,
        );
        await assert.rejects(
          capability.handle("item/tool/call", pushRequest()),
          denied,
        );
        assert.equal(capability.calls, 0);
        assert.equal(capability.violation, true);
        assert.equal(await capability.getResult(), null);
      },
    );
  }
});

test("конкурентный и последующий git_push используют единственный вызов handler", async () => {
  const pending = Promise.withResolvers<GitPushResult>();
  const result = capabilityResult();
  let calls = 0;
  const capability = new GitWorkerCapabilityService(
    { action: "push" },
    context(),
    async () => {
      calls += 1;
      return pending.promise;
    },
  );
  bind(capability);
  const first = capability.handle("item/tool/call", pushRequest());
  const second = capability.handle(
    "item/tool/call",
    pushRequest({ callId: "second-call" }),
  );
  assert.equal(calls, 1);
  pending.resolve(result);
  const responses = await Promise.all([first, second]);
  assert.deepEqual(responses[0], responses[1]);
  assert.deepEqual(
    await capability.handle(
      "item/tool/call",
      pushRequest({ callId: "third-call" }),
    ),
    responses[0],
  );
  await capability.drain();
  assert.strictEqual(await capability.getResult(), result);
  assert.equal(calls, 1);
  assert.equal(capability.calls, 1);
});
