/**
 * @file .ai/tools/agent-search/test/searchGlobs.test.mjs
 * @version 1.0.1
 * @date 2026-09-26
 * @description Проверяет glob скрытых путей и исключения на настоящем ripgrep.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import {
  createSearchFixture,
  FIXTURE_NEEDLE,
} from "./createSearchFixture.adapter.mjs";

function paths(result) {
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split("\n").sort();
}

test("диапазоны и POSIX-классы glob одинаковы в paths, files и matches, включая ext", (t) => {
  const { run, write } = createSearchFixture(t);
  for (const file of ["a.md", "b.md", "c.md", "z.md", "d.ts", "1.md"])
    write(`src/glob-syntax/${file}`);
  for (const [pattern, expected] of [
    ["**/{a..c}.md", ["a.md", "b.md", "c.md"]],
    ["**/[[:alpha:]].md", ["a.md", "b.md", "c.md", "z.md"]],
  ]) {
    for (const ext of [[], ["--ext=md"]]) {
      const common = ["--within=src/glob-syntax", ...ext];
      const names = expected.map((name) => `src/glob-syntax/${name}`);
      assert.deepEqual(
        paths(run([...common, "--output=paths", pattern])),
        names,
      );
      assert.deepEqual(
        paths(
          run([
            ...common,
            "--output=files",
            `--glob=${pattern}`,
            FIXTURE_NEEDLE,
          ]),
        ),
        names,
      );
      const result = run([...common, `--glob=${pattern}`, FIXTURE_NEEDLE]);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        result.stdout
          .trim()
          .split("\n")
          .map((line) => line.split(":")[0])
          .sort(),
        names,
      );
    }
  }
});

test("glob отбирает кандидатов до чтения содержимого", (t) => {
  const { run, write } = createSearchFixture(t);
  write("src/glob-content/keep.ts");
  write(
    "src/glob-content/drop.ts",
    `${FIXTURE_NEEDLE}${"x".repeat(1200000)}\n`,
  );
  for (const filters of [
    ["--glob=**/keep.ts", "--ext=ts"],
    ["--glob=!**/drop.ts"],
  ]) {
    const result = run([
      "--within=src/glob-content",
      ...filters,
      FIXTURE_NEEDLE,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /keep\.ts/u);
    assert.doesNotMatch(result.stdout, /drop\.ts/u);
  }
});

test("**/*.md находит инструкции внутри .ai и .codex во всех формах выдачи", (t) => {
  const { run } = createSearchFixture(t);
  const expected = paths(run(["--mode=ai-active", "--output=paths", "*.md"]));
  assert.equal(expected.length, 8);
  assert.deepEqual(
    paths(run(["--mode=ai-active", "--output=paths", "**/*.md"])),
    expected,
  );
  assert.deepEqual(
    paths(
      run([
        "--mode=ai-active",
        "--output=files",
        "--ext=md",
        "--glob=**/*.md",
        FIXTURE_NEEDLE,
      ]),
    ),
    expected,
  );
  const matches = run(["--mode=ai-active", "--glob=**/*.md", FIXTURE_NEEDLE]);
  assert.equal(matches.status, 0, matches.stderr);
  assert.equal(matches.stdout.trim().split("\n").length, 8);
});

test("общие glob одинаково выбирают скрытые пути в CLI и rg", (t) => {
  const { write, root, run } = createSearchFixture(t);
  const selected = "packages/patterns";
  for (const name of [
    ".hidden/one.md",
    ".nested/.deep/two.md",
    ".hidden/.dot.md",
    "regular/a.md",
    "regular/b.tsx",
    ".hidden/a[1].md",
    ".hidden/(group)/a.md",
    ".hidden/a?.md",
  ])
    write(`${selected}/${name}`);
  for (const pattern of [
    "**/*.md",
    "**/*.{md,tsx}",
    "**/?ne.md",
    "**/[ot]*.md",
    "**/(group)/*.md",
    "**/a\\[1\\].md",
    "**/a\\?.md",
    "**/[!x]*.md",
  ]) {
    const expected = spawnSync(
      "rg",
      [
        "--no-config",
        "--files",
        "--hidden",
        "--no-ignore",
        "--glob",
        pattern,
        "--",
        selected,
      ],
      { cwd: root, encoding: "utf8" },
    );
    const actual = run([
      "--mode=special",
      `--path=${selected}`,
      "--reason=glob-contract",
      "--output=paths",
      pattern,
    ]);
    assert.equal(actual.status, expected.status, pattern);
    assert.deepEqual(paths(actual), paths(expected), pattern);
  }
  const excluded = run([
    "--mode=special",
    `--path=${selected}`,
    "--reason=glob-contract",
    "--output=paths",
    "--glob=!**/.hidden/**",
    "**/*.md",
  ]);
  assert.deepEqual(paths(excluded), [
    `${selected}/.nested/.deep/two.md`,
    `${selected}/regular/a.md`,
  ]);
});

test("явные скрытые пути не обходят исключения даже в special и dry-run", (t) => {
  const { write, run } = createSearchFixture(t);
  for (const selected of [
    ".hidden/.env.local",
    ".hidden/.deep/private.key",
    ".ai/.hidden/node_modules/source.ts",
    ".hidden/.next/output.md",
    ".hidden/build/output.ts",
    ".hidden/nested/data.jsonl",
  ]) {
    write(selected);
    for (const diagnostic of [[], ["--dry-run"]]) {
      const result = run([
        "--mode=special",
        `--path=${selected}`,
        "--reason=exclusion-regression",
        ...diagnostic,
        FIXTURE_NEEDLE,
      ]);
      assert.equal(result.status, 2, selected);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /исключ/u);
    }
  }
});

test("скрытый lock-файл требует точного разрешённого пути", (t) => {
  const { write, run } = createSearchFixture(t);
  write(".hidden/package-lock.json");
  assert.equal(
    run(["--mode=special", "--path=.hidden", "--reason=audit", FIXTURE_NEEDLE])
      .status,
    1,
  );
  assert.deepEqual(
    paths(
      run([
        "--mode=special",
        "--path=.hidden/package-lock.json",
        "--reason=audit",
        "--output=files",
        FIXTURE_NEEDLE,
      ]),
    ),
    [".hidden/package-lock.json"],
  );
});
