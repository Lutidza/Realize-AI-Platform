/**
 * @file .ai/tools/worker-assignment/test/runAssignmentCommand.test.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Проверяет обязательный выбор привязки и коды выхода CLI на временных назначениях.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  copyFile,
  cp,
  mkdir,
  open,
  readFile,
  stat,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createTemporaryAssignment,
  requiredSources,
} from "./temporaryAssignment.fixture";

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const cliSources = ".ai/tools/worker-assignment/src";
const entryPath = "src/module/entry.ts";

/** CLI определяет корень по import.meta.url контроллера. Копия исходников запускается в корне временного назначения. */
async function createCliFixture(t: TestContext, paths = [entryPath]) {
  const { root, lockPath, lock } = await createTemporaryAssignment(t, {
    reviewScope: { paths },
  });
  await mkdir(join(root, "services"));
  await Promise.all([
    cp(join(projectRoot, cliSources), join(root, cliSources), {
      recursive: true,
    }),
    copyFile(join(projectRoot, "package.json"), join(root, "package.json")),
    symlink(
      join(projectRoot, "node_modules"),
      join(root, "node_modules"),
      "dir",
    ),
    symlink(
      join(projectRoot, "services/ai-control-plane"),
      join(root, "services/ai-control-plane"),
      "dir",
    ),
  ]);

  async function run(...args: string[]) {
    const path = join(root, `cli-output-${randomUUID()}`);
    const output = await open(path, "wx");
    try {
      const command = spawn(
        "npm",
        ["run", "--silent", "ai:assignment", "--", ...args],
        {
          cwd: root,
          stdio: ["ignore", output.fd, output.fd],
        },
      );
      const [code] = await once(command, "close");
      return { code, text: await readFile(path, "utf8") };
    } finally {
      await output.close();
    }
  }
  return { root, lockPath, lock, run };
}

test("неизвестная команда возвращает подсказку и код 1", async (t) => {
  const { run } = await createCliFixture(t);
  const result = await run("unknown");
  assert.equal(result.code, 1);
  assert.match(result.text, /ai:assignment -- prepare/);
});

for (const args of [
  ["prepare"],
  ["bind"],
  ["preflight", "--context", "test-context"],
  ["preflight-api", "--context", "test-context", "--model", "test-model"],
]) {
  test(`${args[0]} без --lock требует явно выбрать привязку`, async (t) => {
    const { run } = await createCliFixture(t);
    const result = await run(...args);
    assert.equal(result.code, 1, result.text);
    assert.match(result.text, /обязательный параметр --lock/);
  });
}

test("--help без привязки показывает синтаксис команд", async (t) => {
  const { run } = await createCliFixture(t);
  const result = await run("--help");
  assert.equal(result.code, 0, result.text);
  assert.match(result.text, /prepare --lock/);
});

test("prepare и bind используют файлы явно выбранного назначения", async (t) => {
  for (const paths of [[entryPath], [entryPath, "src/shared/entry.ts"]]) {
    const { root, lockPath, lock, run } = await createCliFixture(t, paths);
    const prepared = await run("prepare", "--lock", lockPath);
    assert.equal(prepared.code, 2, prepared.text);
    const report = JSON.parse(prepared.text);
    assert.equal(report.packageComplete, true);
    assert.equal(report.assignment.id, lock.id);
    assert.equal(report.assignment.revision, lock.revision);
    assert.deepEqual(report.assignment.reviewScope, { paths });
    const material = async (path: string) => ({
      path,
      sha256: lock.files[path],
      bytes: (await stat(join(root, path))).size,
    });
    assert.deepEqual(
      report.sources,
      await Promise.all(requiredSources.map(material)),
    );
    assert.deepEqual(
      report.reviewFiles,
      await Promise.all(paths.map(material)),
    );
    assert.equal(report.status, "blocked");
    assert.deepEqual(
      report.issues.map((issue: { code: string }) => issue.code),
      ["context_not_delivered", "adapter_unbound"],
    );

    const bound = await run("bind", "--lock", lockPath);
    assert.equal(bound.code, 0, bound.text);
    const binding = JSON.parse(bound.text);
    assert.equal(binding.status, "ready");
    assert.equal(binding.assignmentId, lock.id);
    assert.equal(binding.lockSha256, report.lockSha256);
    assert.deepEqual(
      binding.effectiveAccess.readPaths.toSorted(),
      [...requiredSources, ...paths].toSorted(),
    );
  }
});

test("prepare возвращает ошибку чтения для указанного отсутствующего файла", async (t) => {
  const { run } = await createCliFixture(t);
  const path = ".ai/templates/missing.lock.json";
  const result = await run("prepare", "--lock", path);
  assert.equal(result.code, 2, result.text);
  const report = JSON.parse(result.text);
  assert.equal(report.packageComplete, false);
  assert.equal(report.issues[0].code, "NOT_FOUND");
  assert.equal(report.issues[0].path, path);
});
