/**
 * @file .ai/tools/git-delivery/test/GitPush.service.test.ts
 * @version 1.1.1
 * @date 2026-10-22
 * @description Проверяет разрешения, журналирование и восстановление push во временных Git-репозиториях с тестовой сетью.
 */
import { FixtureGit } from "./fixtures/FixtureGit.adapter.ts";
import { PolicyError } from "@realize/git-runtime";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { emptyResult } from "../src/contracts.ts";
import { GitFailure } from "@realize/git-runtime";
import { GIT_FAILURE_CATEGORIES } from "@realize/git-runtime";
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
import { validateGitPushJournal } from "../src/push/validateGitPushJournal.validator.ts";
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
  const git = new FixtureGit(root);
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
              await f.git.runUncoordinatedFixture([
                "rev-parse",
                `${f.source}^{tree}`,
              ])
            ).trim();
            const replacement = (
              await f.git.runUncoordinatedFixture([
                "commit-tree",
                tree,
                "-p",
                f.remote,
                "-m",
                "Fixture with hidden earlier parent",
              ])
            ).trim();
            await f.git.runUncoordinatedFixture([
              "replace",
              f.source,
              replacement,
            ]);
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
              (
                await f.git.runUncoordinatedFixture([
                  "rev-list",
                  f.source,
                  "--not",
                  f.remote,
                ])
              )
                .trim()
                .split("\n"),
              [f.source],
            );
            assert.deepEqual(
              (
                await f.git.runUncoordinatedFixture([
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
            await f.git.runUncoordinatedFixture([
              "update-ref",
              "refs/heads/main",
              f.earlier,
            ]);
          else {
            await f.git.runUncoordinatedFixture([
              "update-ref",
              "refs/heads/other",
              f.source,
            ]);
            await f.git.runUncoordinatedFixture([
              "symbolic-ref",
              "HEAD",
              "refs/heads/other",
            ]);
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

test("recovery принимает только явный целый номер попытки от 1 до 16", async (t) => {
  for (const attempt of [1, 16]) {
    const assigned = { ...context(), recovery: { attempt } };
    const validated = validateGitPushContext(assigned);
    assert.deepEqual(validated.recovery, { attempt });
    assigned.recovery.attempt = 2;
    assert.deepEqual(validated.recovery, { attempt });
  }
  for (const recovery of [
    null,
    true,
    [],
    {},
    { attempt: 0 },
    { attempt: -1 },
    { attempt: 17 },
    { attempt: 1.5 },
    { attempt: "1" },
    { attempt: Number.NaN },
    { attempt: Number.POSITIVE_INFINITY },
    { attempt: 1, force: true },
    { attempt: 1, diagnostic: "synthetic-private-detail" },
  ]) {
    await t.test(JSON.stringify(recovery), async () => {
      const assigned = { ...context(), recovery };
      assert.throws(() => validateGitPushContext(assigned), PolicyError);
      const result = await runGitPush(assigned, {
        async resolveConnection() {
          assert.fail("Некорректное recovery не открывает подключение.");
        },
        async createNetwork() {
          assert.fail("Некорректное recovery не открывает сеть.");
        },
      });
      assert.equal(result.status, "blocked", JSON.stringify(result));
      assert.equal(result.pushStatus, "not_attempted");
    });
  }
});

test("журнал version 1 совместим без новых полей и принимает конечную диагностику", () => {
  const assigned = context();
  const expected: GitPushJournal = {
    version: 1,
    kind: "push",
    binding: "a".repeat(64),
    target: assigned.target,
    commits: assigned.authorization.scope.commits,
    phase: "prepared",
  };
  for (const phase of [
    "prepared",
    "sending",
    "succeeded",
    "unknown",
  ] as const) {
    const legacy = { ...expected, phase };
    assert.deepEqual(validateGitPushJournal(legacy, expected), legacy);
    assert.equal("recoveryAttempts" in legacy, false);
    assert.equal("diagnostic" in legacy, false);
  }
  for (const stage of [
    "context",
    "source",
    "journal",
    "connection",
    "remote",
    "prepare",
    "push",
    "confirm",
    "cleanup",
  ] as const) {
    for (const category of GIT_FAILURE_CATEGORIES) {
      for (const recoveryAttempts of [0, 16]) {
        const journal = {
          ...expected,
          phase: "unknown" as const,
          recoveryAttempts,
          diagnostic: {
            stage,
            category,
            exitCode: recoveryAttempts ? 128 : null,
          },
        };
        assert.deepEqual(validateGitPushJournal(journal, expected), journal);
      }
    }
  }
});

test("журнал отклоняет произвольную диагностику и недопустимые счётчики", () => {
  const assigned = context();
  const expected: GitPushJournal = {
    version: 1,
    kind: "push",
    binding: "a".repeat(64),
    target: assigned.target,
    commits: assigned.authorization.scope.commits,
    phase: "unknown",
  };
  const diagnostic = {
    stage: "push",
    category: "transport_failure",
    exitCode: 128,
  };
  for (const recoveryAttempts of [
    null,
    -1,
    17,
    0.5,
    "1",
    true,
    Number.NaN,
    Infinity,
  ]) {
    assert.throws(
      () => validateGitPushJournal({ ...expected, recoveryAttempts }, expected),
      PolicyError,
      `Недопустимый счётчик: ${String(recoveryAttempts)}`,
    );
  }
  for (const value of [
    null,
    [],
    "synthetic-private-detail",
    {},
    { stage: "push", category: "unknown" },
    { ...diagnostic, stage: "arbitrary-stage" },
    { ...diagnostic, category: "synthetic-private-detail" },
    { ...diagnostic, exitCode: "128" },
    { ...diagnostic, exitCode: Number.NaN },
    { ...diagnostic, exitCode: Infinity },
    { ...diagnostic, stderr: "synthetic-private-detail" },
    { ...diagnostic, message: "synthetic-private-detail" },
    { ...diagnostic, retryable: true },
  ]) {
    assert.throws(
      () =>
        validateGitPushJournal({ ...expected, diagnostic: value }, expected),
      PolicyError,
      `Недопустимая диагностика: ${JSON.stringify(value)}`,
    );
  }
  assert.throws(
    () =>
      validateGitPushJournal(
        { ...expected, recovery: { attempt: 1 } },
        expected,
      ),
    PolicyError,
  );
});

// Создаёт неизвестный исход через штатный handler; сеть и текст ошибки являются только fixture-данными.
async function interruptPush(
  f: Awaited<ReturnType<typeof fixture>>,
): Promise<void> {
  f.network.push = async () => {
    f.calls.push += 1;
    assert.equal((await f.journal())?.phase, "sending");
    throw new GitFailure(
      "git_failed",
      "synthetic-private-detail",
      128,
      "transport_failure",
    );
  };
  const result = await runGitPush(f.context, f.dependencies);
  assert.equal(result.status, "partial", JSON.stringify(result));
  assert.equal(result.pushStatus, "unknown");
  assert.equal((await f.journal())?.phase, "unknown");
}

test("явная recovery отправляет sending/unknown один раз и сохраняет попытку до push", async (t) => {
  for (const phase of ["sending", "unknown"] as const) {
    await t.test(phase, async (child) => {
      const f = await fixture(child);
      const push = f.network.push;
      await interruptPush(f);
      const initial = await f.journal();
      assert.ok(initial);
      // Имитируется уже существующий журнал старой версии после аварийного завершения fixture-процесса.
      initial.binding = createHash("sha256")
        .update(JSON.stringify(validateGitPushContext(f.context)))
        .digest("hex");
      delete initial.recoveryAttempts;
      delete initial.diagnostic;
      initial.phase = phase;
      await f.repository.save(initial);
      blocked(
        await runGitPush(f.context, f.dependencies),
        "push_outcome_unknown",
      );
      assert.equal(f.calls.push, 1);
      assert.deepEqual(await f.journal(), initial);

      f.context.recovery = { attempt: 1 };
      f.network.push = async () => {
        const sending = await f.journal();
        assert.equal(sending?.phase, "sending");
        assert.equal(sending?.recoveryAttempts, 1);
        assert.equal(sending?.binding, initial.binding);
        assert.deepEqual(sending?.target, initial.target);
        assert.deepEqual(sending?.commits, initial.commits);
        await push();
      };
      const recovered = await runGitPush(f.context, f.dependencies);
      assert.equal(recovered.status, "succeeded", JSON.stringify(recovered));
      assert.equal(recovered.remoteCommit, f.source);
      assert.equal((await f.journal())?.recoveryAttempts, 1);
      assert.equal((await f.journal())?.phase, "succeeded");
      assert.equal(f.calls.push, 2);
      const replay = await runGitPush(f.context, f.dependencies);
      assert.equal(replay.status, "noop", JSON.stringify(replay));
      assert.equal(f.calls.push, 2);
    });
  }
});

test("сбой расходует recovery attempt и только следующий номер разрешает новую отправку", async (t) => {
  const f = await fixture(t);
  await interruptPush(f);
  for (const attempt of [1, 2]) {
    f.context.recovery = { attempt };
    f.network.push = async () => {
      f.calls.push += 1;
      assert.equal((await f.journal())?.phase, "sending");
      assert.equal((await f.journal())?.recoveryAttempts, attempt);
      throw new GitFailure(
        "git_failed",
        "synthetic-private-detail",
        128,
        "transport_failure",
      );
    };
    const failed = await runGitPush(f.context, f.dependencies);
    assert.equal(failed.status, "partial", JSON.stringify(failed));
    const consumed = await f.journal();
    assert.equal(consumed?.recoveryAttempts, attempt);
    assert.equal(consumed?.phase, "unknown");
    assert.equal(f.calls.push, attempt + 1);
    const replay = await runGitPush(f.context, f.dependencies);
    assert.equal(replay.status, "blocked", JSON.stringify(replay));
    assert.equal(replay.pushStatus, "unknown");
    assert.equal(f.calls.push, attempt + 1);
    assert.deepEqual(await f.journal(), consumed);
    assert.deepEqual(replay.diagnostic, consumed?.diagnostic);

    // Авария между долговременным sending и обработчиком ошибки не возвращает разрешение на попытку.
    const interrupted = { ...consumed, phase: "sending" as const };
    await f.repository.save(interrupted);
    const interruptedReplay = await runGitPush(f.context, f.dependencies);
    blocked(interruptedReplay, "push_recovery_invalid");
    assert.equal(f.calls.push, attempt + 1);
    assert.deepEqual(await f.journal(), interrupted);
  }
  f.context.recovery = { attempt: 4 };
  const skipped = await runGitPush(f.context, f.dependencies);
  assert.equal(skipped.status, "blocked", JSON.stringify(skipped));
  assert.equal(f.calls.push, 3);
  assert.equal((await f.journal())?.recoveryAttempts, 2);
});

test("recovery поддерживает исходно отсутствующую удалённую ветку", async (t) => {
  const f = await fixture(t);
  f.context.target.remoteOid = null;
  f.context.authorization.scope.commits.push(f.remote);
  f.network.remote = null;
  attest(f.context);
  const push = f.network.push;
  await interruptPush(f);
  f.context.recovery = { attempt: 1 };
  f.network.push = push;
  const result = await runGitPush(f.context, f.dependencies);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.remoteCommit, f.source);
  assert.equal(f.calls.push, 2);
  assert.equal((await f.journal())?.target.remoteOid, null);
  assert.equal((await f.journal())?.recoveryAttempts, 1);
});

test("отказ повторной проверки перед recovery не расходует номер попытки", async (t) => {
  const f = await fixture(t);
  await interruptPush(f);
  const before = await f.journal();
  const resolve = f.dependencies.resolveConnection;
  const resolvesBefore = f.calls.resolve;
  f.context.recovery = { attempt: 1 };
  f.dependencies.resolveConnection = async () => {
    const connection = await resolve();
    return f.calls.resolve === resolvesBefore + 2 &&
      connection.state === "ready"
      ? { ...connection, revision: connection.revision + 1 }
      : connection;
  };
  blocked(await runGitPush(f.context, f.dependencies), "connection_changed");
  assert.deepEqual(await f.journal(), before);
  assert.equal(f.calls.push, 1);
});

test("новая recovery сохраняет ошибку confirm вместо диагностики прежнего сбоя", async (t) => {
  const f = await fixture(t);
  await interruptPush(f);
  assert.equal((await f.journal())?.diagnostic?.category, "transport_failure");
  f.context.recovery = { attempt: 1 };
  f.network.push = async () => {
    f.calls.push += 1;
  };
  const result = await runGitPush(f.context, f.dependencies);
  const diagnostic = { stage: "confirm", category: "unknown", exitCode: null };
  assert.equal(result.status, "partial", JSON.stringify(result));
  assert.equal(result.errorCode, "push_outcome_unknown");
  assert.deepEqual(result.diagnostic, diagnostic);
  assert.deepEqual((await f.journal())?.diagnostic, diagnostic);
  assert.equal((await f.journal())?.recoveryAttempts, 1);
  assert.equal((await f.journal())?.phase, "unknown");
  assert.equal(f.calls.push, 2);
});

test("последняя разрешённая попытка 16 расходуется и больше не отправляет", async (t) => {
  const f = await fixture(t);
  await interruptPush(f);
  const journal = await f.journal();
  assert.ok(journal);
  await f.repository.save({ ...journal, recoveryAttempts: 15 });
  f.context.recovery = { attempt: 16 };
  const failed = await runGitPush(f.context, f.dependencies);
  assert.equal(failed.status, "partial", JSON.stringify(failed));
  assert.equal((await f.journal())?.recoveryAttempts, 16);
  assert.equal(f.calls.push, 2);
  const replay = await runGitPush(f.context, f.dependencies);
  assert.equal(replay.status, "blocked", JSON.stringify(replay));
  assert.equal((await f.journal())?.recoveryAttempts, 16);
  assert.equal(f.calls.push, 2);
});

test("recovery без sending/unknown журнала не разрешает отправку", async (t) => {
  for (const phase of ["absent", "prepared", "succeeded"] as const) {
    await t.test(phase, async (child) => {
      const f = await fixture(child);
      if (phase !== "absent") {
        await runGitPush(f.context, f.dependencies);
        const journal = await f.journal();
        assert.ok(journal);
        await f.repository.save({ ...journal, phase });
        f.network.remote = f.remote;
      }
      const before = await f.journal();
      const pushesBefore = f.calls.push;
      f.context.recovery = { attempt: 1 };
      const result = await runGitPush(f.context, f.dependencies);
      assert.equal(result.status, "blocked", JSON.stringify(result));
      assert.equal(f.calls.push, pushesBefore);
      assert.deepEqual(await f.journal(), before);
    });
  }
});

test("достигнутый sourceOid даёт noop даже после сбоя и повтора recovery", async (t) => {
  const f = await fixture(t);
  await interruptPush(f);
  const push = async () => {
    f.calls.push += 1;
    f.network.remote = f.source;
    throw new GitFailure(
      "git_failed",
      "synthetic-private-detail",
      null,
      "transport_failure",
    );
  };
  f.network.push = push;
  f.context.recovery = { attempt: 1 };
  assert.equal((await runGitPush(f.context, f.dependencies)).status, "partial");
  assert.equal(f.calls.push, 2);
  const replay = await runGitPush(f.context, f.dependencies);
  assert.equal(replay.status, "noop", JSON.stringify(replay));
  assert.equal(replay.pushStatus, "succeeded");
  assert.equal(replay.remoteCommit, f.source);
  assert.equal((await f.journal())?.recoveryAttempts, 1);
  assert.equal(f.calls.push, 2);
});

test("recovery сохраняет исходное назначение, область и проверки immutable", async (t) => {
  for (const change of [
    "project",
    "slug",
    "revision",
    "transport",
    "scope",
    "checks",
  ] as const) {
    await t.test(change, async (child) => {
      const f = await fixture(child);
      await interruptPush(f);
      const before = await f.journal();
      const callsBefore = { ...f.calls };
      f.context.recovery = { attempt: 1 };
      if (change === "project") f.context.projectId = "foreign-project";
      if (change === "slug")
        f.context.target.repositorySlug = "fixture-owner/other-repository";
      if (change === "revision") f.context.target.connectionRevision += 1;
      if (change === "transport") f.context.target.transport = "ssh";
      if (change === "scope") f.context.authorization.scope.commits.reverse();
      if (change === "checks")
        f.context.verification.requiredChecks.push("fixture-additional-check");
      attest(f.context);
      blocked(await runGitPush(f.context, f.dependencies), "request_conflict");
      assert.deepEqual(f.calls, callsBefore);
      assert.deepEqual(await f.journal(), before);
    });
  }
});

test("recovery не расходуется при изменении HEAD, ветки, подключения или remote", async (t) => {
  for (const change of ["head", "branch", "connection", "remote"] as const) {
    await t.test(change, async (child) => {
      const f = await fixture(child);
      await interruptPush(f);
      const before = await f.journal();
      f.context.recovery = { attempt: 1 };
      if (change === "head")
        await f.git.run(["update-ref", "refs/heads/main", f.earlier]);
      if (change === "branch") {
        await f.git.run(["update-ref", "refs/heads/other", f.source]);
        await f.git.run(["symbolic-ref", "HEAD", "refs/heads/other"]);
      }
      if (change === "connection") {
        const resolve = f.dependencies.resolveConnection;
        f.dependencies.resolveConnection = async () => {
          const connection = await resolve();
          return connection.state === "ready"
            ? { ...connection, revision: connection.revision + 1 }
            : connection;
        };
      }
      if (change === "remote") f.network.remote = f.earlier;
      blocked(
        await runGitPush(f.context, f.dependencies),
        change === "connection"
          ? "connection_changed"
          : change === "remote"
            ? "push_remote_changed"
            : "push_source_changed",
      );
      assert.equal(f.calls.push, 1);
      assert.deepEqual(await f.journal(), before);
    });
  }
});

test("сбой push/confirm сохраняет безопасную диагностику для следующего повтора без записи", async (t) => {
  for (const stage of ["push", "confirm"] as const) {
    await t.test(stage, async (child) => {
      const f = await fixture(child);
      const diagnostic = {
        stage,
        category: "transport_failure",
        exitCode: 128,
      };
      const fail = () =>
        new GitFailure(
          "git_failed",
          "synthetic-private-detail",
          128,
          "transport_failure",
        );
      const read = f.network.readRemoteHead;
      f.network.push = async () => {
        f.calls.push += 1;
        if (stage === "push") throw fail();
      };
      f.network.readRemoteHead = async () => {
        if (stage === "confirm" && f.calls.push) throw fail();
        return read();
      };
      const failed = await runGitPush(f.context, f.dependencies);
      assert.equal(failed.status, "partial", JSON.stringify(failed));
      assert.deepEqual(failed.diagnostic, diagnostic);
      const before = await f.journal();
      assert.equal(before?.phase, "unknown");
      assert.deepEqual(before?.diagnostic, diagnostic);
      assert.equal(
        JSON.stringify({ failed, before }).includes("synthetic-private-detail"),
        false,
      );
      f.network.readRemoteHead = read;
      const replay = await runGitPush(f.context, f.dependencies);
      blocked(replay, "push_outcome_unknown");
      assert.deepEqual(replay.diagnostic, diagnostic);
      assert.deepEqual(await f.journal(), before);
      assert.equal(f.calls.push, 1);
    });
  }
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
