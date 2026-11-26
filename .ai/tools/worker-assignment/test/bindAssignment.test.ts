/**
 * @file .ai/tools/worker-assignment/test/bindAssignment.test.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Проверяет привязку временного назначения, границы чтения и отказы при повторном открытии контекста.
 */
import assert from "node:assert/strict";
import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { bindAssignment } from "../src/bindAssignment.service";
import {
  createTemporaryAssignment,
  requiredSources,
  rulePath,
} from "./temporaryAssignment.fixture";

const entryPath = "src/module/entry.ts";
const adjacentPath = "src/module/draft.ts";

async function bindTemporaryAssignment(t: TestContext, paths = [entryPath]) {
  const { root, policy, lockPath, lock } = await createTemporaryAssignment(t, {
    reviewScope: { paths },
  });
  await writeFile(join(root, adjacentPath), "// соседний файл\n");
  const bind = (contextId?: string) =>
    bindAssignment(policy, lockPath, contextId);
  const result = await bind();
  assert(result.context, JSON.stringify(result.report.issues));
  const { contextId } = result.context;
  const file = join(
    root,
    ".ai/tools/worker-assignment/runtime/contexts",
    contextId + ".json",
  );
  return { root, lock, bind, result, contextId, file };
}

function verifyBlocked(
  result: Awaited<ReturnType<typeof bindAssignment>>,
  code: string,
) {
  assert.equal(result.report.status, "blocked");
  assert.equal(result.report.issues[0].code, code);
  assert.equal(result.report.effectiveAccess, null);
  assert.equal(result.context, undefined);
}

test("Один файл и файлы из разных каталогов доступны только в закреплённых версиях", async (t) => {
  for (const paths of [[entryPath], [entryPath, "src/shared/entry.ts"]]) {
    const f = await bindTemporaryAssignment(t, paths);
    const result = await f.bind(f.contextId);
    assert(result.context, JSON.stringify(result.report.issues));
    assert.deepEqual(result.report, f.result.report);
    const { report, context } = result;
    assert.equal(report.status, "ready");
    assert.equal(report.contextId, f.contextId);
    assert.deepEqual(report.effectiveAccess.tools, ["repo_read_file"]);
    assert.deepEqual(report.effectiveAccess.writePaths, []);
    assert.deepEqual(
      report.effectiveAccess.readPaths.toSorted(),
      [...requiredSources, ...paths].toSorted(),
    );
    assert.deepEqual(context.readPins, f.lock.files);
    assert.deepEqual(
      context.scopePins,
      Object.fromEntries(paths.map((path) => [path, f.lock.files[path]])),
    );
    assert.deepEqual(
      report.delivered.map(({ path }) => path),
      requiredSources,
    );
    const input = JSON.parse(context.initialInput);
    assert.equal(input.assignment.id, f.lock.id);
    assert.deepEqual(input.assignment.reviewScope, { paths });
    for (const [i, entry] of report.delivered.entries()) {
      const bytes = await readFile(join(f.root, entry.path));
      assert.equal(entry.sha256, f.lock.files[entry.path]);
      assert.equal(entry.bytes, bytes.length);
      assert.deepEqual(input.sources[i], {
        path: entry.path,
        text: bytes.toString("utf8"),
      });
    }
    assert.equal((await stat(f.file)).mode & 0o777, 0o600);

    const call = context.callTool;
    for (const path of paths) {
      const read = await call("repo_read_file", { path, lineCount: 1 });
      assert.equal(read.version.sha256, f.lock.files[path]);
      assert(read.text.length > 0);
    }
    await assert.rejects(call("repo_read_file", { path: adjacentPath }), {
      code: "FORBIDDEN",
    });
    await assert.rejects(
      call("repo_write_file", { path: entryPath, text: "altered" }),
      { code: "FORBIDDEN" },
    );
    assert.equal(
      (await call("repo_read_file", { path: entryPath })).version.sha256,
      f.lock.files[entryPath],
    );

    const changedPath = paths[paths.length - 1];
    await writeFile(join(f.root, changedPath), "changed\n");
    await assert.rejects(call("repo_read_file", { path: changedPath }), {
      code: "CONFLICT",
    });
    const stale = await f.bind(f.contextId);
    verifyBlocked(stale, "CONFLICT");
    assert.equal(stale.report.issues[0].path, changedPath);
    t.diagnostic(`Проверена область ревью: ${paths.join(", ")}`);
  }
});

test("Отсутствующий или усечённый текст обязательного правила блокирует выдачу", async (t) => {
  const f = await bindTemporaryAssignment(t);
  const original = await readFile(f.file, "utf8");
  for (const truncate of [false, true]) {
    const state = JSON.parse(original);
    const sources: { path: string; text: string }[] =
      state.initialInput.sources;
    const index = sources.findIndex((entry) => entry.path === rulePath);
    assert(index >= 0);
    if (truncate) sources[index].text = sources[index].text.slice(0, -1);
    else sources.splice(index, 1);
    await writeFile(f.file, JSON.stringify(state));
    const result = await f.bind(f.contextId);
    verifyBlocked(result, "context_not_delivered");
    assert.equal(result.report.issues[0].path, rulePath);
  }
  t.diagnostic(f.contextId + " blocked: context_not_delivered " + rulePath);
});

test("Лишний путь, запись, инструмент или чужой SHA-256 блокируют весь адаптер", async (t) => {
  const f = await bindTemporaryAssignment(t);
  const original = await readFile(f.file, "utf8");
  for (const change of ["extraPath", "write", "tool", "pin"]) {
    const state = JSON.parse(original);
    const grant = state.access;
    switch (change) {
      case "extraPath":
        grant.readPins[adjacentPath] = f.lock.files[entryPath];
        break;
      case "write":
        grant.writePaths.push(entryPath);
        break;
      case "tool":
        grant.tools.push("shell");
        break;
      case "pin":
        grant.readPins[entryPath] = "0".repeat(64);
        break;
    }
    await writeFile(f.file, JSON.stringify(state));
    verifyBlocked(await f.bind(f.contextId), "access_mismatch");
  }
  t.diagnostic(f.contextId + " blocked: access_mismatch; доступ закрыт");
});

test("Контекст другой привязки или ревизии блокируется до выдачи обработчика", async (t) => {
  const f = await bindTemporaryAssignment(t);
  const other = await f.bind();
  assert(other.context);
  assert.notEqual(other.context.contextId, f.contextId);
  const otherFile = join(dirname(f.file), other.context.contextId + ".json");
  const original = await readFile(f.file, "utf8");
  await copyFile(otherFile, f.file);
  verifyBlocked(await f.bind(f.contextId), "context_mismatch");
  for (const mismatch of [
    { revision: 2 },
    { assignmentId: "other" },
    { lockSha256: "0".repeat(64) },
  ]) {
    await writeFile(
      f.file,
      JSON.stringify({ ...JSON.parse(original), ...mismatch }),
    );
    verifyBlocked(await f.bind(f.contextId), "context_mismatch");
  }
  t.diagnostic(f.contextId + " blocked: context_mismatch; доступ закрыт");
});
