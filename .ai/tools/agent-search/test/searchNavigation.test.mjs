/**
 * @file .ai/tools/agent-search/test/searchNavigation.test.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Проверяет настоящий CLI navigation: budgets, исключения, Unicode и диагностику.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, readFileSync, linkSync, symlinkSync } from "node:fs";
import path from "node:path";
import { createSearchFixture } from "./createSearchFixture.adapter.mjs";

test("CLI definitions/files сокращает шум и сохраняет ignore scope", (t) => {
  const { write, run } = createSearchFixture(t, { populate: false });
  write(
    "src/owner.ts",
    "// Target\nexport function Target() {}\nconst TargetOptions = 1;\nTarget();",
  );
  write("src/hidden.ts", "export const Target = 2;");
  write("src/.gitignore", "hidden.ts\n");
  write("src/payload-types.ts", "export const Target = 3;");
  const result = run(["--intent=definitions", "Target"], { timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /src\/owner\.ts:2:17:\[function\]/);
  assert.doesNotMatch(result.stdout, /hidden|payload-types|TargetOptions/);
  const files = run(["--intent=references", "--output=files", "Target"], {
    timeout: 15000,
  });
  assert.equal(files.stdout.split("\n")[0], "src/owner.ts");
});

test("CLI syntax сохраняет байтовые координаты для многоязычного текста и BOM/CRLF", (t) => {
  const { write, run } = createSearchFixture(t, { populate: false });
  for (const name of [
    "English",
    "Русский",
    "ქართული",
    "العربية",
    "漢字",
    "e\u0301",
  ]) {
    const prefix = "/*👩🏽‍💻 e\u0301*/ export const ";
    write("src/unicode.ts", `\uFEFF${prefix}${name} = 1;\r\n${name};\r\n`);
    const result = run(["--intent=definitions", name], { timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.includes(
        `src/unicode.ts:1:${Buffer.byteLength(prefix) + 1}:`,
      ),
      result.stdout,
    );
  }
});

test("CLI caseless Unicode не теряет quoted property из-за контекстного регистра", (t) => {
  const { write, run } = createSearchFixture(t, { populate: false });
  const prefix = "const model={";
  write("src/greek.ts", `${prefix}'ΟΣ':Foo};`);
  const result = run(["--intent=definitions", "--ignoreCase=true", "ος"], {
    timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    result.stdout.includes(
      `src/greek.ts:1:${Buffer.byteLength(prefix) + 1}:[property]`,
    ),
    result.stdout,
  );
});

test("coverage раскрывает unsupported, syntax errors, large, binary и hardlinks", (t) => {
  const { root, write, run } = createSearchFixture(t, { populate: false });
  const valid = write("src/valid.ts", "export const Needle = 1;");
  write("src/invalid.ts", "function Needle( {");
  write("src/large.ts", " ".repeat(524289));
  write("src/binary.ts", Buffer.from([0, 0xff]));
  write("src/other.py", "Needle = 1");
  linkSync(valid, path.join(root, "src/hard.ts"));
  symlinkSync("/etc/passwd", path.join(root, "src/alias.ts"));
  const result = run(["--intent=definitions", "Needle"], { timeout: 15000 });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /unsupported=1 skipped=4 syntax-errors=1/);
  assert.doesNotMatch(result.stdout, /root:|export const/);
});

test("navigation limit/bytes/timeout не перезапускают поиск, telemetry не содержит имён", (t) => {
  const { root, write, run } = createSearchFixture(t, { populate: false });
  write("src/unique-owner.ts", "const Needle = 1;\nNeedle;\nNeedle;\n");
  const target = path.join(
    root,
    ".ai-workspace/tasks/navigation/logs/result.json",
  );
  mkdirSync(path.dirname(target), { recursive: true });
  const result = run(
    [
      "--intent=references",
      "--limit=1",
      "--max-bytes=512",
      `--metrics-file=${target}`,
      "Needle",
    ],
    { timeout: 15000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Выдача неполная/);
  assert.ok(Buffer.byteLength(result.stdout) <= 512, result.stdout);
  const raw = readFileSync(target, "utf8");
  assert.doesNotMatch(raw, /Needle|unique-owner/);
  const event = JSON.parse(raw);
  assert.equal(event.operation, "references");
  assert.equal(event.filesRead, 1);
  assert.ok(event.bytesRead > 0);
  assert.equal(event.modelTokens, null);
  const timeout = run(["--intent=definitions", "--timeout-ms=1", "Needle"], {
    timeout: 15000,
  });
  assert.equal(timeout.status, 2);
  assert.match(timeout.stderr, /лимит времени/);
});

test("invalid intent/regexp/paths отказывают; text не загружает TypeScript", (t) => {
  const { write, run } = createSearchFixture(t, { populate: false });
  write("src/a.ts", "const Needle = 1;");
  for (const flags of [
    ["--intent=semantic"],
    ["--intent=definitions", "--regex"],
    ["--intent=references", "--output=paths"],
  ])
    assert.equal(run([...flags, "Needle"]).status, 2);
  const hook = write(
    "hook.mjs",
    'import { registerHooks } from "node:module"; registerHooks({ resolve(specifier, context, next) { if (specifier === "typescript") throw new Error("parser-not-allowed"); return next(specifier, context); } });',
  );
  const options = {
    env: { ...process.env, NODE_OPTIONS: `--import=${hook}` },
    timeout: 15000,
  };
  assert.equal(run(["Needle"], options).status, 0);
  assert.match(
    run(["--intent=definitions", "Needle"], options).stderr,
    /parser-not-allowed/,
  );
});
