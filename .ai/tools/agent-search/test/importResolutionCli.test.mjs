/**
 * @file .ai/tools/agent-search/test/importResolutionCli.test.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Проверяет настоящий CLI resolution, фильтры исходников, bounded stdout и обезличенные метрики.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createSearchFixture } from "./createSearchFixture.adapter.mjs";

const flags = ["--intent=imports", "--resolve-imports", "--from=src/main.ts"];

test("CLI раскрывает paths/barrel до функции и автоматически формирует корректные метрики", (t) => {
  const { root, write, run } = createSearchFixture(t, { populate: false });
  write("tsconfig.json", '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}');
  write("src/main.ts", 'import { Public as Local } from "@/barrel";');
  write(
    "src/barrel/index.ts",
    'export { Original as Public } from "../owner.service";',
  );
  write("src/owner.service.ts", "export function Original() {}");
  const output = path.join(
    root,
    ".ai-workspace/tasks/fixture/logs/metrics.json",
  );
  mkdirSync(path.dirname(output), { recursive: true });
  const result = run([...flags, `--metrics-file=${output}`, "Local"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /=> src\/owner\.service\.ts:1:17 \[function\] via src\/barrel\/index\.ts:/u,
  );
  const metrics = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(metrics.operation, "imports");
  assert.equal(metrics.filesRead, 4);
  assert.equal(metrics.limits.scanBytes, 4194304);
  assert.equal(metrics.narrowed, true);
  assert.equal(metrics.modelTokens, null);
  assert.doesNotMatch(
    JSON.stringify(metrics),
    /Local|Original|barrel|owner\.service/u,
  );
});

test("ignore, within и glob ограничивают target без расширения профиля", (t) => {
  const { write, run } = createSearchFixture(t, { populate: false });
  write("src/main.ts", 'import { Local } from "./hidden";');
  write("src/hidden.ts", "export function Local() {}");
  write("src/.gitignore", "hidden.ts\n");
  const ignored = run([...flags, "Local"]);
  assert.match(ignored.stdout, /\[unresolved:not_found\]/u);
  assert.doesNotMatch(ignored.stdout, /=> src\/hidden\.ts/u);
  write("src/feature/main.ts", 'import { Local } from "../other";');
  write("src/other.ts", "export function Local() {}");
  const narrowed = run([
    "--intent=imports",
    "--resolve-imports",
    "--from=src/feature/main.ts",
    "--within=src/feature",
    "Local",
  ]);
  assert.match(narrowed.stdout, /\[unresolved:forbidden\]/u);
  const globbed = run([...flags, "--glob=!**/hidden*", "Local"]);
  assert.match(globbed.stdout, /\[unresolved:forbidden\]/u);
});

test("resolve flags не меняют обычный imports и отклоняют неоднозначные параметры", (t) => {
  const { write, run } = createSearchFixture(t, { populate: false });
  write("src/main.ts", 'import { Local } from "./a";');
  write("src/a.ts", "export const Local = 1;");
  const ordinary = run(["--intent=imports", "--within=src/main.ts", "Local"]);
  assert.equal(ordinary.status, 0);
  assert.doesNotMatch(ordinary.stdout, /=>|# imports:/u);
  for (const args of [
    ["--from=src/main.ts", "Local"],
    ["--resolve-imports", "--from=src/main.ts", "Local"],
    ["--intent=imports", "--resolve-imports", "Local"],
    [...flags, "--output=files", "Local"],
    [...flags, "--max-depth=13", "Local"],
    ["--intent=imports", "--resolve-imports", "--from=../outside.ts", "Local"],
  ])
    assert.equal(run(args).status, 2, args.join(" "));
});

test("лимиты количества/байтов и timeout сохраняют ограниченный реальный stdout", (t) => {
  const { write, run } = createSearchFixture(t, { populate: false });
  write(
    "src/main.ts",
    Array.from(
      { length: 8 },
      (_, n) => `import {Local as Local${n}} from './a';`,
    ).join("\n"),
  );
  write("src/a.ts", "export const Local = 1;");
  const limited = run([...flags, "--limit=1", "Local"]);
  assert.equal(limited.status, 0);
  assert.equal(
    limited.stdout.split("\n").filter((line) => line.includes("=>")).length,
    1,
  );
  assert.match(limited.stdout, /Выдача неполная/u);
  const bytes = run([...flags, "--max-bytes=512", "Local"]);
  assert.equal(bytes.status, 0);
  assert.ok(Buffer.byteLength(bytes.stdout) <= 512, bytes.stdout);
  const timeout = run([...flags, "--timeout-ms=1", "Local"]);
  assert.equal(timeout.status, 2);
  assert.match(timeout.stderr, /лимит времени/u);
});
