/**
 * @file .ai/tools/agent-search/test/searchProfiles.test.mjs
 * @version 1.0.0
 * @date 2026-09-26
 * @description Проверяет полноту областей поиска и исключение неактивных источников.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { rmSync } from "node:fs";
import path from "node:path";
import {
  createSearchFixture,
  FIXTURE_NEEDLE,
} from "./createSearchFixture.adapter.mjs";

function found(result) {
  assert.equal(result.status, 0, result.stderr);
  return new Set(result.stdout.trim().split("\n"));
}

test("code находит packages/services и исключает quarantine, generated, зависимости и секреты", (t) => {
  const { run } = createSearchFixture(t);
  const files = found(run(["--output=files", "--glob=*", FIXTURE_NEEDLE]));
  for (const expected of [
    "services/api/server.ts",
    "packages/ui-kit/src/Widget.tsx",
    "packages/payload-ai-plugin/src/server.ts",
    "src/components/Widget.tsx",
    "scripts/check.mjs",
    "tests/sample.test.ts",
  ])
    assert.ok(files.has(expected), expected);
  assert.equal(files.size, 14);
  assert.doesNotMatch(
    [...files].join("\n"),
    /RealizeCore|_realize|\(reference\)|payload-types|payload-generated|importMap|node_modules|dist\/|package-lock|\.env|private\.key/u,
  );
});

test("каждый профиль выбирает действующих владельцев, а legacy доступен только адресно с причиной", (t) => {
  const { run } = createSearchFixture(t);
  const cases = [
    ["docs", ["README.md", "AGENTS.md", "documentation/current.md"]],
    ["next-routes", ["src/app/(app)/page.tsx"]],
    ["migrations", ["src/migrations/initial.ts"]],
    [
      "payload",
      [
        "src/payload.config.ts",
        "src/collections/Products.ts",
        "src/globals/Header.ts",
        "src/blocks/Content.tsx",
        "src/migrations/initial.ts",
        "packages/payload-ai-plugin/src/server.ts",
        "packages/payload-ai-plugin/src/admin/Panel.tsx",
      ],
    ],
    [
      "ui",
      [
        "src/app/(app)/page.tsx",
        "src/components/Widget.tsx",
        "src/providers/Context.tsx",
        "src/blocks/Content.tsx",
        "packages/ui-kit/src/Widget.tsx",
        "packages/payload-ai-plugin/src/admin/Panel.tsx",
      ],
    ],
    [
      "domain",
      [
        "src/RealizeCore/services/search/index.ts",
        "src/RealizeCore/data/searchProfiles/index.ts",
        "src/RealizeCore/collections/Search/index.ts",
      ],
    ],
    [
      "search-layer",
      [
        "src/RealizeCore/services/search/index.ts",
        "src/RealizeCore/data/searchProfiles/index.ts",
        "src/RealizeCore/collections/Search/index.ts",
      ],
    ],
  ];
  for (const [mode, expected] of cases) {
    const files = found(
      run([
        `--mode=${mode}`,
        "--output=files",
        "--reason=profile-audit",
        FIXTURE_NEEDLE,
      ]),
    );
    assert.deepEqual(files, new Set(expected), mode);
  }
  const combined = found(
    run(["--mode=code-docs", "--output=files", FIXTURE_NEEDLE]),
  );
  assert.ok(combined.has("documentation/current.md"));
  assert.ok(combined.has("services/api/server.ts"));
  const active = found(
    run(["--mode=ai-active", "--output=files", FIXTURE_NEEDLE]),
  );
  assert.equal(active.size, 8);
  assert.ok(active.has(".codex/skills/one/SKILL.md"));
  assert.ok(!active.has(".ai/README.md"));
  const ai = found(run(["--mode=ai", "--output=files", FIXTURE_NEEDLE]));
  assert.equal(ai.size, 6);
  assert.ok(ai.has(".ai/README.md"));
  const codex = found(run(["--mode=codex", "--output=files", FIXTURE_NEEDLE]));
  assert.equal(codex.size, 4);
});

test("docs остаётся Markdown при дополнительных glob, ext и path", (t) => {
  const { run, write } = createSearchFixture(t);
  write("documentation/current.json");
  const files = found(
    run(["--mode=docs", "--output=files", "--glob=current.*", FIXTURE_NEEDLE]),
  );
  assert.deepEqual(files, new Set(["documentation/current.md"]));
  assert.equal(run(["--mode=docs", "--ext=json", FIXTURE_NEEDLE]).status, 2);
  assert.equal(
    run([
      "--mode=docs",
      "--path=documentation/current.json",
      "--reason=audit",
      FIXTURE_NEEDLE,
    ]).status,
    2,
  );
});

test("ext и glob пересекаются, paths ищет имена без чтения содержимого", (t) => {
  const { run, write } = createSearchFixture(t);
  write("src/components/Widget.md");
  write("src/components/Widget.ts", "no content match\n");
  const files = found(
    run(["--output=files", "--ext=tsx", "--glob=Widget.*", FIXTURE_NEEDLE]),
  );
  assert.deepEqual(
    files,
    new Set(["src/components/Widget.tsx", "packages/ui-kit/src/Widget.tsx"]),
  );
  const paths = found(run(["--output=paths", "--ext=ts", "*Widget*"]));
  assert.deepEqual(paths, new Set(["src/components/Widget.ts"]));
  assert.equal(
    run(["--output=paths", "--ignoreCase=true", "*widget.ts"]).status,
    0,
  );
});

test("фильтр расширений сохраняет исключения .gitignore", (t) => {
  const { run, write } = createSearchFixture(t);
  write("src/.gitignore", "local-only/\n");
  write("src/local-only/private.ts");
  const result = run(["--ext=ts", "--output=files", FIXTURE_NEEDLE]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /local-only/u);
});

test("special/reference читают только выбранный референс, включая локальную задачу", (t) => {
  const { run } = createSearchFixture(t);
  for (const [mode, selected] of [
    ["reference", "documentation/reports/old.md"],
    ["special", ".ai-workspace/tasks/one/drafts"],
  ]) {
    const files = found(
      run([
        `--mode=${mode}`,
        `--path=${selected}`,
        "--reason=reference-audit",
        "--output=files",
        FIXTURE_NEEDLE,
      ]),
    );
    assert.deepEqual(
      files,
      new Set([mode === "reference" ? selected : `${selected}/result.md`]),
    );
  }
});

test("lock-файл требует точного пути, directory glob не включает его", (t) => {
  const { run } = createSearchFixture(t);
  const args = [
    "--mode=special",
    "--reason=dependency-audit",
    "--output=files",
    FIXTURE_NEEDLE,
  ];
  assert.equal(run([...args, "--path=packages/example"]).status, 1);
  assert.deepEqual(
    found(run([...args, "--path=packages/example/package-lock.json"])),
    new Set(["packages/example/package-lock.json"]),
  );
  assert.ok(
    found(
      run([
        "--path=packages/example/package-lock.json",
        "--reason=dependency-audit",
        "--output=files",
        FIXTURE_NEEDLE,
      ]),
    ).has("packages/example/package-lock.json"),
  );
});

test("отсутствующий optional каталог заметен, существующие результаты сохраняются", (t) => {
  const { root, run } = createSearchFixture(t);
  rmSync(path.join(root, "services"), { recursive: true });
  const result = run(["--output=files", FIXTURE_NEEDLE]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /services/u);
  assert.match(result.stdout, /packages\/ui-kit/u);
});
