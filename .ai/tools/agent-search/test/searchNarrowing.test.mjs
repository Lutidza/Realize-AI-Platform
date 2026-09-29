/**
 * @file .ai/tools/agent-search/test/searchNarrowing.test.mjs
 * @version 1.0.1
 * @date 2026-09-26
 * @description Проверяет сужение профилей без расширения области и ослабления исключений.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createSearchFixture,
  FIXTURE_NEEDLE,
} from "./createSearchFixture.adapter.mjs";

function files(result) {
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split("\n").sort();
}

test("within не возвращает файлы, исключённые ignore исходного корня", (t) => {
  const { run, write } = createSearchFixture(t);
  write("src/.gitignore", "ignored/\n*.omit.ts\n");
  write("src/ignored/evidence.ts");
  write("src/components/hidden.omit.ts");
  const baseline = files(run(["--output=files", FIXTURE_NEEDLE]));
  assert.ok(!baseline.includes("src/ignored/evidence.ts"));
  assert.ok(!baseline.includes("src/components/hidden.omit.ts"));
  for (const within of [
    "src/ignored",
    "src/ignored/evidence.ts",
    "src/components/hidden.omit.ts",
  ]) {
    for (const output of ["paths", "files", "matches"]) {
      const result = run([
        `--within=${within}`,
        `--output=${output}`,
        output === "paths" ? "**/*.ts" : FIXTURE_NEEDLE,
      ]);
      assert.equal(result.status, 1, `${within}: ${output}: ${result.stderr}`);
      assert.match(result.stdout, /Совпадений нет/u);
    }
  }
  const selected = files(
    run(["--within=src/components", "--output=files", FIXTURE_NEEDLE]),
  );
  assert.deepEqual(
    selected,
    baseline.filter((file) => file.startsWith("src/components/")),
  );
});

test("within сохраняет вложенные ignore и их отрицания, а glob не возвращает исключённые файлы", (t) => {
  const { run, write } = createSearchFixture(t);
  write("src/.gitignore", "*.ignored.ts\n");
  write("src/components/.gitignore", "!keep.ignored.ts\n");
  write("src/components/keep.ignored.ts");
  write("src/providers/drop.ignored.ts");
  write("src/components/.ignore", "skip.ts\n");
  write("src/components/skip.ts");
  const baseline = files(
    run(["--output=files", "--glob=**/*.ts", FIXTURE_NEEDLE]),
  );
  assert.ok(baseline.includes("src/components/keep.ignored.ts"));
  assert.ok(!baseline.includes("src/components/skip.ts"));
  assert.ok(!baseline.includes("src/providers/drop.ignored.ts"));
  assert.deepEqual(
    files(
      run([
        "--within=src/components",
        "--output=files",
        "--glob=**/*.ts",
        FIXTURE_NEEDLE,
      ]),
    ),
    baseline.filter((file) => file.startsWith("src/components/")),
  );
});

test("within сужает ui до каталога или файла без reason и отражается в dry-run", (t) => {
  const { run } = createSearchFixture(t);
  for (const selected of [
    "packages/ui-kit/src",
    "packages/ui-kit/src/Widget.tsx",
  ]) {
    const args = ["--mode=ui", `--within=${selected}`];
    assert.deepEqual(files(run([...args, "--output=files", FIXTURE_NEEDLE])), [
      "packages/ui-kit/src/Widget.tsx",
    ]);
    assert.deepEqual(files(run([...args, "--output=paths", "**/*.tsx"])), [
      "packages/ui-kit/src/Widget.tsx",
    ]);
    const dry = run([...args, "--dry-run", FIXTURE_NEEDLE]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.ok(dry.stdout.split("\n").includes(`paths: ${selected}`));
  }
});

test("несколько within объединяются без повторного поиска вложенных путей", (t) => {
  const { run } = createSearchFixture(t);
  const result = run([
    "--mode=ui",
    "--within=src/components",
    "--within=src/components/Widget.tsx",
    "--within=src/components/",
    "--within=packages/ui-kit/src",
    "--output=files",
    FIXTURE_NEEDLE,
  ]);
  assert.deepEqual(files(result), [
    "packages/ui-kit/src/Widget.tsx",
    "src/components/Widget.tsx",
  ]);
});

test("within не разрешает соседний профиль, предка или похожий префикс", (t) => {
  const { run, write } = createSearchFixture(t);
  write("src/components-other/Extra.tsx");
  for (const selected of [
    "services/api",
    "src",
    "packages",
    "src/components-other",
    "documentation/current.md",
  ])
    assert.equal(
      run(["--mode=ui", `--within=${selected}`, "--dry-run", FIXTURE_NEEDLE])
        .status,
      2,
      selected,
    );
});

test("within сохраняет исключения профиля, расширения и lock-контракт", (t) => {
  const { run } = createSearchFixture(t);
  const result = run(["--within=src", "--output=files", FIXTURE_NEEDLE]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(
    result.stdout,
    /RealizeCore|payload-types|payload-generated|importMap|\.env|private\.key/u,
  );
  for (const selected of [
    "src/RealizeCore",
    "src/payload-types.ts",
    "src/.env.local",
    "packages/example/node_modules",
    "packages/example/package-lock.json",
  ])
    assert.equal(
      run([`--within=${selected}`, "--reason=audit", FIXTURE_NEEDLE]).status,
      2,
      selected,
    );
  assert.equal(
    run(["--mode=docs", "--within=README.md", FIXTURE_NEEDLE]).status,
    0,
  );
  assert.equal(
    run(["--within=src/components/Widget.tsx", "--ext=ts", FIXTURE_NEEDLE])
      .status,
    2,
  );
  assert.deepEqual(
    files(
      run([
        "--path=packages/example/package-lock.json",
        "--reason=audit",
        "--within=packages/example/package-lock.json",
        "--output=files",
        FIXTURE_NEEDLE,
      ]),
    ),
    ["packages/example/package-lock.json"],
  );
});

test("within проходит общую проверку путей, включая dry-run", (t) => {
  const { root, run } = createSearchFixture(t);
  for (const selected of [
    root,
    "../outside",
    "src/../README.md",
    "C:\\private",
    ".",
    ".ai-workspace/tasks",
    "missing",
    "",
  ])
    assert.equal(
      run([`--within=${selected}`, "--dry-run", FIXTURE_NEEDLE]).status,
      2,
      selected,
    );
});

test("within проверяет каноническую цель symlink относительно области профиля", (t) => {
  const { root, workspace, run, write } = createSearchFixture(t);
  writeFileSync(path.join(workspace, "outside.ts"), FIXTURE_NEEDLE);
  write(".hidden/.env.local");
  for (const [name, target] of [
    ["inside", path.join(root, "src/components")],
    ["sibling", path.join(root, "services/api")],
    ["secret", path.join(root, ".hidden/.env.local")],
    ["outside", path.join(workspace, "outside.ts")],
  ])
    symlinkSync(target, path.join(root, `src/components/${name}`));
  assert.deepEqual(
    files(
      run([
        "--mode=ui",
        "--within=src/components/inside",
        "--output=files",
        FIXTURE_NEEDLE,
      ]),
    ),
    ["src/components/Widget.tsx"],
  );
  for (const name of ["sibling", "secret", "outside"])
    assert.equal(
      run(["--mode=ui", `--within=src/components/${name}`, FIXTURE_NEEDLE])
        .status,
      2,
      name,
    );
});

test("within сужает явно разрешённое расширение и не заменяет обязательные path/reason", (t) => {
  const { run } = createSearchFixture(t);
  assert.deepEqual(
    files(
      run([
        "--mode=ui",
        "--path=services/api",
        "--reason=audit",
        "--within=services/api",
        "--output=files",
        FIXTURE_NEEDLE,
      ]),
    ),
    ["services/api/server.ts"],
  );
  assert.deepEqual(
    files(
      run([
        "--mode=special",
        "--path=src",
        "--reason=audit",
        "--within=src/components",
        "--output=files",
        FIXTURE_NEEDLE,
      ]),
    ),
    ["src/components/Widget.tsx"],
  );
  assert.equal(
    run(["--mode=special", "--reason=audit", "--within=src", FIXTURE_NEEDLE])
      .status,
    2,
  );
  assert.equal(
    run(["--mode=domain", "--within=src/RealizeCore", FIXTURE_NEEDLE]).status,
    2,
  );
});
