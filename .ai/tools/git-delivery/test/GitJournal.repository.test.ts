/**
 * @file .ai/tools/git-delivery/test/GitJournal.repository.test.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверки границ файлового журнала в изолированных временных каталогах.
 */
import assert from "node:assert/strict";
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
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { PolicyError } from "../src/contracts.ts";
import { GitJournalRepository } from "../src/GitJournal.repository.ts";

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
