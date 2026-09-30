/**
 * @file .ai/tools/agent-search/test/searchObservationSpool.test.mjs
 * @version 1.0.1
 * @date 2026-09-30
 * @description Проверяет автоматическую диагностику, ограничение очереди и отказ без изменения поиска.
 * @see documentation/architecture/repository-search.md
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { createSearchFixture } from "./createSearchFixture.adapter.mjs";
import {
  acknowledgeSearchObservations,
  enqueueSearchObservation,
  readSearchObservationSpool,
  SEARCH_SPOOL_POLICY,
} from "../src/searchObservationSpool.adapter.mjs";

function measuredFixture(t) {
  const fixture = createSearchFixture(t, { populate: false });
  for (const name of ["src", "packages", "services", "tests", "scripts"])
    mkdirSync(path.join(fixture.root, name), { recursive: true });
  fixture.write("src/private-file.ts", "private_term_тест\n");
  const result = fixture.run(["private_term_тест"]);
  assert.equal(result.status, 0, result.stderr);
  const batch = readSearchObservationSpool(fixture.root);
  assert.equal(batch.rows.length, 1);
  return { ...fixture, result, event: JSON.parse(batch.rows[0].payload) };
}

test("CLI автоматически записывает только замеры, без флага и без изменения stdout", (t) => {
  const { root, event, result } = measuredFixture(t);
  assert.match(result.stdout, /src\/private-file.ts:1:1:/u);
  assert.equal(result.stderr, "");
  assert.doesNotMatch(JSON.stringify(event), /private_term|private-file/u);
  assert.equal(event.returnedCount, 1);
  assert.equal(event.source, "cli");
  assert.equal(event.modelTokens, null);
  const file = path.join(
    root,
    ".ai/tools/agent-search/runtime/search-observations.sqlite",
  );
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(file)).mode & 0o777, 0o700);
});

test("экспорт использует тот же eventID, подтверждение одного consumer не удаляет новые события", (t) => {
  const { root, run, write, event } = measuredFixture(t);
  const target = write(".ai-workspace/tasks/export/logs/.keep", "").replace(
    ".keep",
    "search.json",
  );
  const result = run([`--metrics-file=${target}`, "private_term_тест"]);
  assert.equal(result.status, 0);
  const exported = JSON.parse(readFileSync(target, "utf8"));
  acknowledgeSearchObservations(root, [event.eventID]);
  acknowledgeSearchObservations(root, [event.eventID]);
  const batch = readSearchObservationSpool(root);
  assert.deepEqual(
    batch.rows.map((row) => row.eventID),
    [exported.eventID],
  );
  assert.deepEqual(JSON.parse(batch.rows[0].payload), exported);
});

test("очередь ограничена, сохраняет свежие события и удаляет истёкшие", (t) => {
  const { root, event } = measuredFixture(t);
  for (let index = 0; index < SEARCH_SPOOL_POLICY.capacity + 20; index++) {
    assert.equal(
      enqueueSearchObservation(root, { ...event, eventID: randomUUID() }),
      true,
    );
  }
  const batch = readSearchObservationSpool(root);
  assert.equal(batch.rows.length, SEARCH_SPOOL_POLICY.capacity);
  assert.equal(batch.dropped, 21);
  const expiredID = randomUUID();
  assert.equal(
    enqueueSearchObservation(root, {
      ...event,
      eventID: expiredID,
      observedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    }),
    true,
  );
  assert.ok(
    readSearchObservationSpool(root).rows.every(
      (row) => row.eventID !== expiredID,
    ),
  );
  assert.ok(
    statSync(
      path.join(
        root,
        ".ai/tools/agent-search/runtime/search-observations.sqlite",
      ),
    ).size <= SEARCH_SPOOL_POLICY.databaseBytes,
  );
});

test("занятая SQLite не задерживает поиск и не меняет его успешный результат", (t) => {
  const { root, event, run, result } = measuredFixture(t);
  const database = new DatabaseSync(
    path.join(
      root,
      ".ai/tools/agent-search/runtime/search-observations.sqlite",
    ),
  );
  try {
    database.exec("BEGIN EXCLUSIVE");
    assert.equal(
      enqueueSearchObservation(root, { ...event, eventID: randomUUID() }),
      false,
    );
    const next = run(["private_term_тест"]);
    assert.equal(next.status, result.status);
    assert.equal(next.stdout, result.stdout);
    assert.equal(next.stderr, "");
  } finally {
    database.close();
  }
});

test("symlink и общедоступный runtime отклоняются, поиск сохраняется", (t) => {
  const { root, run, write } = createSearchFixture(t, { populate: false });
  for (const name of ["src", "packages", "services", "tests", "scripts"])
    mkdirSync(path.join(root, name), { recursive: true });
  write("src/test.ts", "needle\n");
  const outside = path.join(root, "outside");
  mkdirSync(outside);
  symlinkSync(
    outside,
    path.join(root, ".ai/tools/agent-search/runtime"),
    "dir",
  );
  const result = run(["needle"]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.throws(
    () => readSearchObservationSpool(root),
    /SEARCH_SPOOL_UNSAFE_PATH/,
  );
  const second = measuredFixture(t);
  chmodSync(path.join(second.root, ".ai/tools/agent-search/runtime"), 0o755);
  assert.equal(enqueueSearchObservation(second.root, second.event), false);
});
