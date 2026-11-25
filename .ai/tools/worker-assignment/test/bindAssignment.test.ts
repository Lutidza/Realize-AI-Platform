/**
 * @file .ai/tools/worker-assignment/test/bindAssignment.test.ts
 * @version 1.0.1
 * @date 2026-11-25
 * @description Проверяет допуск и три причины отказа на изолированных копиях назначения формы.
 */
import assert from "node:assert/strict";
import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { bindAssignment } from "../src/bindAssignment.service";
import {
  adjacent,
  articleAuditFixture as fixture,
  view,
} from "./articleAudit.fixture";

const rule = ".ai/rules/development/RULE-CODE-STRUCTURE.md";

function verifyBlocked(
  result: Awaited<ReturnType<typeof bindAssignment>>,
  code: string,
) {
  assert.equal(result.report.status, "blocked");
  assert.equal(result.report.issues[0].code, code);
  assert.equal(result.report.effectiveAccess, null);
  assert.equal(result.context, undefined);
}

test("1. Полный контекст формы открывается повторно с одним ограниченным обработчиком", async (t) => {
  const f = await fixture(t);
  const result = await f.bind(f.contextId);
  assert(result.context);
  assert.deepEqual(result.report, f.result.report);
  const report = result.report;
  assert(report.effectiveAccess && "delivered" in report);
  assert.equal(report.status, "ready");
  assert.equal(report.contextId, f.contextId);
  assert.equal(report.delivered.length, 6);
  assert.deepEqual(report.effectiveAccess.tools, ["repo_read_file"]);
  assert.deepEqual(report.effectiveAccess.writePaths, []);
  assert.deepEqual(
    report.effectiveAccess.readPaths.toSorted(),
    Object.keys(f.lock.files).toSorted(),
  );
  assert.equal(report.effectiveAccess.readPaths.length, 18);
  const input = JSON.parse(result.context.initialInput);
  assert.equal(input.assignment.id, f.lock.id);
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
  const call = result.context.callTool;
  const read = await call("repo_read_file", { path: view, lineCount: 1 });
  assert.equal(read.version.sha256, f.lock.files[view]);
  assert(read.text.length > 0);
  await assert.rejects(call("repo_read_file", { path: adjacent }), {
    code: "FORBIDDEN",
  });
  await assert.rejects(
    call("repo_write_file", { path: view, text: "altered" }),
    { code: "FORBIDDEN" },
  );
  assert.equal(
    (await call("repo_read_file", { path: view })).version.sha256,
    f.lock.files[view],
  );
  await writeFile(join(f.root, view), "changed\n");
  await assert.rejects(call("repo_read_file", { path: view }), {
    code: "CONFLICT",
  });
  const stale = await f.bind(f.contextId);
  verifyBlocked(stale, "CONFLICT");
  t.diagnostic(
    f.contextId +
      " ready: 6 источников, 18 путей, repo_read_file, 0 путей записи",
  );
});

test("2. Отсутствующий или усечённый текст обязательного правила блокирует выдачу", async (t) => {
  const f = await fixture(t);
  const original = await readFile(f.file, "utf8");
  for (const truncate of [false, true]) {
    const state = JSON.parse(original);
    const sources: { path: string; text: string }[] =
      state.initialInput.sources;
    const index = sources.findIndex((entry) => entry.path === rule);
    assert(index >= 0);
    if (truncate) sources[index].text = sources[index].text.slice(0, -1);
    else sources.splice(index, 1);
    await writeFile(f.file, JSON.stringify(state));
    const result = await f.bind(f.contextId);
    verifyBlocked(result, "context_not_delivered");
    assert.equal(result.report.issues[0].path, rule);
  }
  t.diagnostic(f.contextId + " blocked: context_not_delivered " + rule);
});

test("3. Лишний путь, запись, инструмент или чужой SHA-256 блокируют весь адаптер", async (t) => {
  const f = await fixture(t);
  const original = await readFile(f.file, "utf8");
  for (const change of ["extraPath", "write", "tool", "pin"]) {
    const state = JSON.parse(original);
    const grant = state.access;
    switch (change) {
      case "extraPath":
        grant.readPins[adjacent] = f.lock.files[view];
        break;
      case "write":
        grant.writePaths.push(view);
        break;
      case "tool":
        grant.tools.push("shell");
        break;
      case "pin":
        grant.readPins[view] = "0".repeat(64);
        break;
    }
    await writeFile(f.file, JSON.stringify(state));
    verifyBlocked(await f.bind(f.contextId), "access_mismatch");
  }
  t.diagnostic(f.contextId + " blocked: access_mismatch; доступ закрыт");
});

test("4. Контекст другой привязки или ревизии блокируется до выдачи обработчика", async (t) => {
  const f = await fixture(t);
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
