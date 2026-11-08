/**
 * @file .ai/tools/engineering/test/tsconfigPaths.test.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Проверяет точные JSONC patches и явный допуск host к dependent config effects.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { rewriteTsconfigPaths } from "../src/rewriteTsconfigPaths.util.ts";
import { validateProjectMovePolicy } from "../src/validateProjectMovePolicy.validator.ts";
import type { ProjectMovePolicy } from "../src/ProjectArtifactBinding.types.ts";

const source =
  '\uFEFF{\r\n  // Сохраняем Unicode и прочие настройки.\r\n  "compilerOptions": { "baseUrl": ".", "strict": true, "paths": { "@price": ["src/old/calculate.util"], "@app/*": ["src/*"], }, },\r\n  "include": ["src/**/*"],\r\n}\r\n';
const replacement = new Map([
  [
    "@price",
    { previous: "src/old/calculate.util", next: "src/new/calculate.util" },
  ],
]);
test("JSONC patch сохраняет все bytes вне единственного target token", () => {
  assert.equal(
    rewriteTsconfigPaths("tsconfig.json", source, replacement),
    source.replace('"src/old/calculate.util"', '"src/new/calculate.util"'),
  );
  assert.equal(
    rewriteTsconfigPaths("tsconfig.json", source, new Map()),
    source,
  );
});

test("exact и wildcard targets меняются одним JSONC patch без изменения ключей", () => {
  const edits = new Map([
    ...replacement,
    ["@app/*", { previous: "src/*", next: "moved/*" }],
  ]);
  assert.equal(
    rewriteTsconfigPaths("tsconfig.json", source, edits),
    source
      .replace('"src/old/calculate.util"', '"src/new/calculate.util"')
      .replace('"src/*"', '"moved/*"'),
  );
  for (const next of ["moved/file", "moved/*/*"])
    assert.throws(
      () =>
        rewriteTsconfigPaths(
          "tsconfig.json",
          source,
          new Map([["@app/*", { previous: "src/*", next }]]),
        ),
      { code: "UNSUPPORTED" },
    );
  assert.throws(
    () =>
      rewriteTsconfigPaths(
        "tsconfig.json",
        source,
        new Map([
          ["@price", { previous: "src/old/calculate.util", next: "src/new/*" }],
        ]),
      ),
    { code: "UNSUPPORTED" },
  );
});
for (const [name, text] of [
  [
    "root duplicate",
    source.replace('"include":', '"compilerOptions": {}, "include":'),
  ],
  [
    "option duplicate",
    source.replace('"strict": true', '"baseUrl": "src", "strict": true'),
  ],
  [
    "paths duplicate",
    source.replace('"@app/*":', '"@price": ["src/other"], "@app/*":'),
  ],
  [
    "fallback",
    source.replace(
      '["src/old/calculate.util"]',
      '["src/old/calculate.util", "fallback"]',
    ),
  ],
  ["invalid JSONC", source + "broken"],
  ["stale target", source.replace('"src/old/calculate.util"', '"src/stale"')],
])
  test(`config patch отклоняет ${name}`, () =>
    assert.throws(
      () => rewriteTsconfigPaths("tsconfig.json", text, replacement),
      { code: "UNSUPPORTED" },
    ));

test("native patch сохраняет extends и не требует собственного baseUrl", () => {
  const inherited = source
    .replace('"baseUrl": ".", ', "")
    .replace('"include":', '"extends": "./options", "include":');
  assert.equal(
    rewriteTsconfigPaths("config/paths.json", inherited, replacement),
    inherited.replace('"src/old/calculate.util"', '"src/new/calculate.util"'),
  );
  assert.throws(
    () =>
      rewriteTsconfigPaths(
        "config/paths.json",
        '{"extends":"./base"}',
        replacement,
      ),
    { code: "UNSUPPORTED" },
  );
});

test("config policy требует явную полноту consumers и точный отдельный JSONC owner", () => {
  const policy: ProjectMovePolicy = {
    changedOn: "2026-10-29",
    coverage: "complete",
    referenceRoots: ["src"],
    sourcePaths: ["policy.json"],
    tsconfigWrite: {
      path: "tsconfig.json",
      allConsumersInReferenceRoots: true,
    },
  };
  assert.deepEqual(validateProjectMovePolicy(policy), policy);
  const inherited = {
    ...policy,
    tsconfigWrite: { ...policy.tsconfigWrite!, path: "config/paths.json" },
  };
  assert.deepEqual(validateProjectMovePolicy(inherited), inherited);
  const projects = {
    ...policy,
    tsconfigWrite: {
      ...policy.tsconfigWrite!,
      projectConfigPaths: ["config/build.json", "config/test.json"],
    },
  };
  assert.deepEqual(validateProjectMovePolicy(projects), projects);
  for (const projectConfigPaths of [
    [],
    ["config/build.json", "config/build.json"],
    ["src/tsconfig.json"],
    ["config/build.yaml"],
    ["../external.json"],
    ["/tmp/config.json"],
    Array.from({ length: 17 }, (_, i) => `config/${i}.json`),
  ])
    assert.throws(() =>
      validateProjectMovePolicy({
        ...policy,
        tsconfigWrite: { ...policy.tsconfigWrite!, projectConfigPaths },
      }),
    );
  for (const write of [
    { path: "tsconfig.json" },
    { path: "tsconfig.json", allConsumersInReferenceRoots: false },
    { path: "src/tsconfig.json", allConsumersInReferenceRoots: true },
    { path: "config/paths.yaml", allConsumersInReferenceRoots: true },
    {
      path: "tsconfig.json",
      allConsumersInReferenceRoots: true,
      wildcard: true,
    },
  ])
    assert.throws(() =>
      validateProjectMovePolicy({
        ...policy,
        tsconfigWrite: write,
      } as ProjectMovePolicy),
    );
});
