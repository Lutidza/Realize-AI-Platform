/**
 * @file .ai/tools/git-delivery/test/GitJournal.repository.test.ts
 * @version 1.0.2
 * @date 2026-10-22
 * @description Проверки границ файлового журнала в изолированных временных каталогах.
 */
import { PolicyError } from "@realize/git-runtime";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import {
  access,
  chmod,
  link,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { parseContext } from "../src/contracts.ts";
import type { Context } from "../src/contracts.ts";
import { GitJournalRepository } from "../src/GitJournal.repository.ts";
import { loadGitContext } from "../src/loadGitContext.adapter.ts";
import type { GitPushJournal } from "../src/push/GitPush.types.ts";
import { validateGitPushJournal } from "../src/push/validateGitPushJournal.validator.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "realize-git-journal-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = new GitJournalRepository({
    repositoryRoot: root,
    taskId: "fixture-task",
    requestId: "fixture-request",
  });
  const path = join(root, repository.relativePath);
  return { root, repository, path, parent: dirname(path) };
}

function policyCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof PolicyError && error.code === code;
}

test("контекст без TASK сохраняет requestId и журнал неизвестного исхода после повторного открытия и утраты context", async (t) => {
  const f = await fixture(t);
  const launches = (
    [
      "exec",
      "execFile",
      "execFileSync",
      "execSync",
      "fork",
      "spawn",
      "spawnSync",
    ] as const
  ).map((method) =>
    t.mock.method(childProcess, method, () => {
      throw new Error(
        "Сценарий не должен запускать Git, task-workspace или воркеры.",
      );
    }),
  );
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });

  assert.deepEqual(await readdir(f.root), []);
  const input: Context = {
    version: 1,
    requestId: "fixture-request",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: f.root,
    authorization: {
      actions: ["push"],
      scope: { mode: "paths", paths: ["README.md"] },
    },
  };
  const operationDirectory = join(f.root, ".ai-workspace/tasks", input.taskId);
  const contextDirectory = join(
    operationDirectory,
    "tmp/git-delivery",
    input.requestId,
  );
  const contextPath = join(contextDirectory, "context.json");
  const siblingPath = join(contextDirectory, "preserved.json");
  await mkdir(contextDirectory, { recursive: true, mode: 0o700 });
  await writeFile(contextPath, JSON.stringify(input), { mode: 0o600 });
  await writeFile(siblingPath, '{"preserved":true}\n', { mode: 0o600 });

  await assert.rejects(
    loadGitContext("context.json"),
    policyCode("context_required"),
  );
  await chmod(contextPath, 0o640);
  await assert.rejects(
    loadGitContext(contextPath),
    policyCode("context_unsafe"),
  );
  await chmod(contextPath, 0o600);
  const contextLink = join(contextDirectory, "context-link.json");
  await symlink(contextPath, contextLink);
  await assert.rejects(loadGitContext(contextLink), { code: "ELOOP" });
  await rm(contextLink);

  const rawContext = await loadGitContext(contextPath);
  const context = parseContext(rawContext);
  assert.deepEqual(context, input);
  assert.equal((await stat(contextPath)).mode & 0o777, 0o600);
  assert.equal((await stat(contextPath)).uid, process.getuid?.());
  for (const key of ["taskId", "requestId"] as const) {
    assert.throws(
      () => parseContext({ ...context, [key]: "../outside" }),
      policyCode("invalid_identifier"),
    );
  }
  for (const path of ["../outside.md", ".git/config"]) {
    assert.throws(
      () =>
        parseContext({
          ...context,
          authorization: {
            ...context.authorization,
            scope: { mode: "paths", paths: [path] },
          },
        }),
      policyCode("invalid_path"),
    );
  }

  const repository = new GitJournalRepository(context);
  assert.equal(repository.relativePath, f.repository.relativePath);
  assert.equal(await repository.load(), null);
  assert.deepEqual(await readdir(operationDirectory), ["tmp"]);
  // Проверяем файловую границу и настоящую схему журнала, без выполнения push.
  const journal: GitPushJournal = {
    version: 1,
    kind: "push",
    binding: "a".repeat(64),
    target: {
      connectionKey: "github:primary",
      connectionRevision: 1,
      repositorySlug: "fixture/repository",
      transport: "https",
      branch: "main",
      sourceOid: "b".repeat(40),
      remoteOid: "c".repeat(40),
    },
    commits: ["b".repeat(40)],
    phase: "unknown",
    diagnostic: {
      stage: "push",
      category: "transport_failure",
      exitCode: null,
    },
    recoveryAttempts: 0,
  };
  await repository.save(validateGitPushJournal(journal, journal));
  const reopenedContext = parseContext(await loadGitContext(contextPath));
  assert.equal(reopenedContext.requestId, input.requestId);
  const reopened = new GitJournalRepository(reopenedContext);
  assert.equal(reopened.relativePath, repository.relativePath);
  const restored = validateGitPushJournal(await reopened.load(), journal);
  assert.deepEqual(restored, journal);
  assert.equal(restored.phase, "unknown");
  assert.throws(
    () =>
      validateGitPushJournal(restored, {
        ...journal,
        target: { ...journal.target, branch: "other" },
      }),
    policyCode("request_conflict"),
  );
  assert.equal((await stat(f.path)).mode & 0o777, 0o600);
  assert.equal((await stat(f.path)).uid, process.getuid?.());

  // Имитируем утрату собственного context: при unknown штатная очистка запрещена.
  const journalBytes = await readFile(f.path);
  await rm(contextPath);
  await assert.rejects(loadGitContext(contextPath), { code: "ENOENT" });
  const afterContextLoss = new GitJournalRepository(reopenedContext);
  assert.deepEqual(
    validateGitPushJournal(await afterContextLoss.load(), journal),
    journal,
  );
  assert.deepEqual(await readFile(f.path), journalBytes);
  assert.equal(await readFile(siblingPath, "utf8"), '{"preserved":true}\n');
  assert.deepEqual(await readdir(f.parent), [`${input.requestId}.json`]);
  assert.deepEqual((await readdir(operationDirectory)).sort(), ["logs", "tmp"]);
  for (const path of [
    join(f.root, ".git"),
    join(operationDirectory, "TASK.md"),
    join(operationDirectory, "artifact-manifest.json"),
    join(operationDirectory, "logs/results"),
    join(f.root, ".ai-workspace/history"),
  ]) {
    await assert.rejects(access(path), { code: "ENOENT" });
  }
  for (const launch of launches) assert.equal(launch.mock.callCount(), 0);
});

test("отсутствующий журнал возвращает null без создания каталогов", async (t) => {
  const f = await fixture(t);
  assert.equal(
    f.repository.relativePath,
    ".ai-workspace/tasks/fixture-task/logs/git-delivery/fixture-request.json",
  );
  assert.equal(await f.repository.load(), null);
  assert.deepEqual(await readdir(f.root), []);
  await mkdir(f.parent, { recursive: true });
  assert.equal(await f.repository.load(), null);
  assert.deepEqual(await readdir(f.parent), []);
});

test("хранилище сохраняет произвольный JSON без прикладной схемы с личными правами", async (t) => {
  const f = await fixture(t);
  const value = { operation: "push", nested: ["Журнал", 1, false, null] };
  await f.repository.save(value);
  assert.deepEqual(await f.repository.load(), value);
  assert.equal(await readFile(f.path, "utf8"), JSON.stringify(value) + "\n");
  assert.equal((await stat(f.path)).mode & 0o777, 0o600);
  assert.equal((await stat(f.path)).uid, process.getuid?.());
  let current = f.root;
  for (const part of f.repository.relativePath.split("/").slice(0, -1)) {
    current = join(current, part);
    assert.equal((await stat(current)).mode & 0o777, 0o700);
  }
});

test("повторная запись атомарно заменяет inode и не оставляет временные файлы", async (t) => {
  const f = await fixture(t);
  await f.repository.save({ phase: "prepared" });
  const previous = join(f.root, "previous.json");
  await link(f.path, previous);
  await f.repository.save({ phase: "completed" });
  assert.deepEqual(await f.repository.load(), { phase: "completed" });
  assert.deepEqual(JSON.parse(await readFile(previous, "utf8")), {
    phase: "prepared",
  });
  assert.deepEqual(await readdir(f.parent), ["fixture-request.json"]);
});

test("ошибка fsync файла сохраняет прежний журнал и удаляет временный файл", async (t) => {
  const f = await fixture(t);
  await f.repository.save({ phase: "prepared" });
  const handle = await open(f.path);
  const prototype = Object.getPrototypeOf(handle);
  const originalSync = prototype.sync;
  await handle.close();
  t.mock.method(prototype, "sync", async function (this: FileHandle) {
    if ((await this.stat()).isFile()) throw new Error("fixture sync failure");
    await originalSync.call(this);
  });
  await assert.rejects(f.repository.save({ phase: "completed" }), {
    message: "fixture sync failure",
  });
  assert.deepEqual(await f.repository.load(), { phase: "prepared" });
  assert.deepEqual(await readdir(f.parent), ["fixture-request.json"]);
});

test("предел 2 MiB учитывает UTF-8 и перевод строки до любых записей", async (t) => {
  const f = await fixture(t);
  const exact = "я".repeat(1024 * 1024 - 2) + "x";
  assert.equal(
    Buffer.byteLength(JSON.stringify(exact) + "\n"),
    2 * 1024 * 1024,
  );
  const oversized = exact + "x";
  await assert.rejects(
    f.repository.save(oversized),
    policyCode("invalid_journal"),
  );
  assert.deepEqual(await readdir(f.root), []);
  await f.repository.save(exact);
  assert.equal(await f.repository.load(), exact);
  await assert.rejects(
    f.repository.save(oversized),
    policyCode("invalid_journal"),
  );
  assert.equal(await f.repository.load(), exact);
  assert.deepEqual(await readdir(f.parent), ["fixture-request.json"]);
  await writeFile(f.path, JSON.stringify(oversized) + "\n");
  await assert.rejects(f.repository.load(), policyCode("invalid_journal"));
});

test("несериализуемое значение отклоняется без создания файлов", async (t) => {
  const f = await fixture(t);
  const cyclic: unknown[] = [];
  cyclic.push(cyclic);
  for (const value of [undefined, 1n, cyclic]) {
    await assert.rejects(
      f.repository.save(value),
      policyCode("invalid_journal"),
    );
    assert.deepEqual(await readdir(f.root), []);
  }
});

test("чтение отклоняет доступ группе, повреждённый JSON и невалидный UTF-8", async (t) => {
  const f = await fixture(t);
  await f.repository.save({ phase: "prepared" });
  await chmod(f.path, 0o640);
  await assert.rejects(f.repository.load(), policyCode("invalid_journal"));
  await chmod(f.path, 0o600);
  for (const bytes of [
    Buffer.from("{broken"),
    Buffer.from([0x22, 0xff, 0x22]),
  ]) {
    await writeFile(f.path, bytes);
    await assert.rejects(f.repository.load(), policyCode("invalid_journal"));
  }
});

test("symlink в каждом каталоге предка блокирует чтение и запись", async (t) => {
  const parts = [
    ".ai-workspace",
    "tasks",
    "fixture-task",
    "logs",
    "git-delivery",
  ];
  for (let index = 0; index < parts.length; index++) {
    await t.test(parts.slice(0, index + 1).join("/"), async (child) => {
      const f = await fixture(child);
      const outside = join(f.root, "outside");
      await mkdir(outside);
      const ancestor = join(f.root, ...parts.slice(0, index));
      await mkdir(ancestor, { recursive: true });
      await symlink(outside, join(ancestor, parts[index]));
      await assert.rejects(
        f.repository.load(),
        policyCode("journal_unavailable"),
      );
      await assert.rejects(f.repository.save({ phase: "prepared" }));
      assert.deepEqual(await readdir(outside), []);
    });
  }
});

test("symlink и каталог вместо файла не читаются и не заменяются", async (t) => {
  const f = await fixture(t);
  await mkdir(f.parent, { recursive: true });
  const outside = join(f.root, "outside.json");
  await writeFile(outside, '{"preserved":true}\n', { mode: 0o600 });
  await symlink(outside, f.path);
  await assert.rejects(f.repository.load(), policyCode("invalid_journal"));
  await assert.rejects(
    f.repository.save({ replaced: true }),
    policyCode("invalid_journal"),
  );
  assert.equal(await readFile(outside, "utf8"), '{"preserved":true}\n');
  await rm(f.path);
  await mkdir(f.path);
  await assert.rejects(f.repository.load(), policyCode("invalid_journal"));
  await assert.rejects(
    f.repository.save({ replaced: true }),
    policyCode("invalid_journal"),
  );
  assert.equal((await stat(f.path)).isDirectory(), true);
  await assert.rejects(access(join(f.path, "fixture-request.json")));
  assert.deepEqual(await readdir(f.parent), ["fixture-request.json"]);
});
