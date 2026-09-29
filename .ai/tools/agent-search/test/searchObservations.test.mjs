/**
 * @file .ai/tools/agent-search/test/searchObservations.test.mjs
 * @version 1.0.0
 * @date 2026-09-27
 * @description Проверяет явный экспорт метрик, неизменность выдачи и Unicode реальные вызовы CLI.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createSearchFixture } from "./createSearchFixture.adapter.mjs";

test("экспорт не сохраняет query/content и не перезаписывает существующий файл", (t) => {
  const { root, run, write } = createSearchFixture(t, { populate: false });
  write("src/private-name.ts", "private_search_phrase\n");
  const target = path.join(
    root,
    ".ai-workspace/tasks/fixture/logs/search.json",
  );
  mkdirSync(path.dirname(target), { recursive: true });
  const plain = run(["private_search_phrase"]);
  const measured = run([`--metrics-file=${target}`, "private_search_phrase"]);
  assert.equal(measured.stdout, plain.stdout);
  assert.equal(measured.status, plain.status);
  const raw = readFileSync(target, "utf8");
  assert.doesNotMatch(raw, /private_search_phrase|private-name/);
  const event = JSON.parse(raw);
  assert.equal(event.returnedCount, 1);
  assert.equal(event.bytesRead, null);
  assert.equal(event.outputBytes, Buffer.byteLength(plain.stdout));
  assert.equal(event.coordinates, "utf8_bytes_1based");
  assert.equal(event.modelTokens, null);
  const again = run([`--metrics-file=${target}`, "private_search_phrase"]);
  assert.equal(again.status, plain.status);
  assert.match(again.stderr, /Диагностика не сохранена/u);
  assert.equal(readFileSync(target, "utf8"), raw);
});

test("Unicode, combining marks, BOM, CRLF и приоритетные регистры сохраняют выдачу", (t) => {
  const { run, write } = createSearchFixture(t, { populate: false });
  for (const term of [
    "English",
    "Русский",
    "ქართული",
    "العربية",
    "漢字",
    "👩🏽‍💻",
    "e\u0301",
  ]) {
    write("src/unicode.ts", `\uFEFF${term}\r\n🙂x\u0301 ${term}\r\n`);
    const result = run([term]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes("src/unicode.ts:1:1:"), result.stdout);
    assert.ok(result.stdout.includes(`src/unicode.ts:2:9:`), result.stdout);
    assert.ok(result.stdout.includes(term));
    assert.doesNotMatch(result.stdout, /�/u);
  }
  write("src/unicode.ts", "ENGLISH РУССКИЙ\r\n");
  for (const term of ["english", "русский"]) {
    assert.equal(run([term]).status, 1);
    assert.equal(run(["-i", term]).status, 0);
  }
});
