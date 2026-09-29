/**
 * @file .ai/tools/agent-search/test/searchScope.test.mjs
 * @version 1.0.0
 * @date 2026-09-26
 * @description Проверяет границы путей, аргументы и безопасный запуск поиска.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createSearchFixture,
  FIXTURE_NEEDLE,
} from "./createSearchFixture.adapter.mjs";

test("некорректные аргументы и неразрешённые расширения области отклоняются до запуска", (t) => {
  const { run } = createSearchFixture(t);
  for (const args of [
    [],
    ["--mode=unknown", "query"],
    ["--unknown=true", "query"],
    ["--mode=domain", "query"],
    ["--mode=search-layer", "query"],
    ["--mode=reference", "--reason=audit", "query"],
    ["--path=src", "query"],
    ["--limit=0", "query"],
    ["--limit=5abc", "query"],
    ["--limit=501", "query"],
    ["--max-bytes=100", "query"],
    ["--timeout-ms=60001", "query"],
    ["--fixed=maybe", "query"],
    ["--mode=code", "--mode=docs", "query"],
    ["--regex", "--fixed", "query"],
    ["--glob", "query"],
    ["--ext=", "query"],
    ["--reason=line\nbreak", "query"],
    ["--mode=constructor", "query"],
  ])
    assert.equal(run(args).status, 2, JSON.stringify(args));
});

test("absolute, traversal, корень и общая рабочая область запрещены даже в dry-run", (t) => {
  const { root, run } = createSearchFixture(t);
  for (const selected of [
    root,
    "../outside",
    "src/../README.md",
    "C:\\private",
    ".",
    ".ai-workspace",
    ".ai-workspace/tasks",
    "missing",
  ]) {
    const result = run([
      "--mode=special",
      `--path=${selected}`,
      "--reason=boundary-audit",
      "--dry-run",
      "query",
    ]);
    assert.equal(result.status, 2, selected);
    assert.equal(result.stdout, "");
  }
});

test("symlink наружу и на секрет запрещены; внутренний alias разрешается в настоящий путь", (t) => {
  const { root, workspace, run } = createSearchFixture(t);
  const outside = path.join(workspace, "tmp/outside");
  mkdirSync(outside);
  writeFileSync(path.join(outside, "source.ts"), FIXTURE_NEEDLE);
  symlinkSync(outside, path.join(root, "outside-alias"));
  symlinkSync(
    path.join(root, "src/.env.local"),
    path.join(root, "secret-alias"),
  );
  symlinkSync(
    path.join(root, "src/components"),
    path.join(root, "inside-alias"),
  );
  for (const selected of [
    "outside-alias",
    "outside-alias/source.ts",
    "secret-alias",
  ])
    assert.equal(
      run([
        "--mode=special",
        `--path=${selected}`,
        "--reason=audit",
        FIXTURE_NEEDLE,
      ]).status,
      2,
    );
  const result = run([
    "--mode=special",
    "--path=inside-alias",
    "--reason=audit",
    "--output=files",
    FIXTURE_NEEDLE,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "src/components/Widget.tsx");
  symlinkSync(outside, path.join(root, "src/nested-outside"));
  assert.doesNotMatch(
    run(["--output=files", FIXTURE_NEEDLE]).stdout,
    /nested-outside/u,
  );
});

test("явный файл и пользовательский glob не обходят запреты", (t) => {
  const { run } = createSearchFixture(t);
  for (const selected of [
    "src/.env.local",
    "src/private.key",
    "packages/example/node_modules",
    "packages/example/dist/index.ts",
  ])
    assert.equal(
      run([
        "--mode=special",
        `--path=${selected}`,
        "--reason=audit",
        "--glob=*",
        FIXTURE_NEEDLE,
      ]).status,
      2,
    );
  assert.equal(
    run(["--path=src/RealizeCore", "--reason=audit", FIXTURE_NEEDLE]).status,
    2,
  );
});

test("повторные/вложенные paths не дублируют выдачу", (t) => {
  const { run } = createSearchFixture(t);
  const result = run([
    "--mode=special",
    "--path=src/components",
    "--path=src/components/Widget.tsx",
    "--path=src/components/",
    "--reason=audit",
    "--output=files",
    FIXTURE_NEEDLE,
  ]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "src/components/Widget.tsx");
});

test("RIPGREP_CONFIG_PATH не расширяет scope; запрос не исполняется shell", (t) => {
  const { root, write, run } = createSearchFixture(t);
  const config = write("rg.config", "--pre=does-not-exist\n");
  assert.equal(
    run(["--output=files", FIXTURE_NEEDLE], {
      env: { ...process.env, RIPGREP_CONFIG_PATH: config },
    }).status,
    0,
  );
  const query = "$(touch injected) `touch injected2` 'literal'";
  write("src/literal.ts", `${query}\n`);
  const args = [
    "--mode=special",
    "--path=src/literal.ts",
    "--reason=audit",
    query,
  ];
  assert.equal(run(args).status, 0);
  const dry = run([...args, "--dry-run"]);
  assert.equal(dry.status, 0);
  const command = dry.stdout.split("\n").find((line) => line.startsWith("rg "));
  assert.equal(spawnSync("bash", ["-c", command], { cwd: root }).status, 0);
  assert.equal(existsSync(path.join(root, "injected")), false);
  assert.equal(existsSync(path.join(root, "injected2")), false);
});
