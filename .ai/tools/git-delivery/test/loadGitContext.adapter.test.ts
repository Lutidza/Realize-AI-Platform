/**
 * @file .ai/tools/git-delivery/test/loadGitContext.adapter.test.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет повторное чтение контекста, защиту пути, предел размера и закрытие файла.
 */

import assert from "node:assert/strict";
import {
  mkdtemp,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { loadGitContext } from "../src/loadGitContext.adapter.ts";

async function fixture(context: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "realize-context-reader-"));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("каждый вызов читает JSON из переданного личного файла", async (context) => {
  const directory = await fixture(context);
  const first = join(directory, "first.json");
  const second = join(directory, "second.json");
  await writeFile(first, JSON.stringify({ marker: "первый" }), { mode: 0o600 });
  await writeFile(second, JSON.stringify({ marker: "второй" }), {
    mode: 0o600,
  });
  assert.deepEqual(await loadGitContext(first), { marker: "первый" });
  assert.deepEqual(await loadGitContext(second), { marker: "второй" });
  await writeFile(first, JSON.stringify({ marker: "обновлённый" }));
  assert.deepEqual(await loadGitContext(first), { marker: "обновлённый" });
});

test("отсутствующий или относительный путь сохраняет context_required", async () => {
  await assert.rejects(loadGitContext(undefined), { code: "context_required" });
  await assert.rejects(loadGitContext("relative.json"), {
    code: "context_required",
  });
});

test("символическая ссылка не открывает даже допустимый файл назначения", async (context) => {
  const directory = await fixture(context);
  const path = join(directory, "context.json");
  const link = join(directory, "context-link.json");
  await writeFile(path, "{}", { mode: 0o600 });
  await symlink(path, link);
  await assert.rejects(loadGitContext(link), { code: "ELOOP" });
});

test("допускает ровно 1 MiB и отвергает превышение лимита", async (context) => {
  const directory = await fixture(context);
  const path = join(directory, "context.json");
  const bytes = Buffer.alloc(1024 * 1024 + 1, 0x20);
  bytes.write('{"marker":"boundary"}');
  await writeFile(path, bytes.subarray(0, 1024 * 1024), { mode: 0o600 });
  assert.deepEqual(await loadGitContext(path), { marker: "boundary" });
  await writeFile(path, bytes);
  await assert.rejects(loadGitContext(path), { code: "context_unsafe" });
});

test(
  "ошибка UTF-8 закрывает descriptor и не мешает следующему чтению",
  {
    skip: process.platform !== "linux",
  },
  async (context) => {
    const directory = await fixture(context);
    const path = join(directory, "context.json");
    await writeFile(path, Buffer.from([0xff]), { mode: 0o600 });
    await assert.rejects(loadGitContext(path), {
      code: "ERR_ENCODING_INVALID_ENCODED_DATA",
    });
    const descriptors = await readdir("/proc/self/fd");
    const targets = await Promise.all(
      descriptors.map(async (descriptor) => {
        try {
          return await readlink(`/proc/self/fd/${descriptor}`);
        } catch {
          return undefined;
        }
      }),
    );
    assert.equal(targets.includes(path), false);
    await writeFile(path, '{"recovered":true}');
    assert.deepEqual(await loadGitContext(path), { recovered: true });
  },
);
