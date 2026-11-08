/**
 * @file .ai/tools/engineering/test/sourceMoveResolver.test.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет resolution виртуального результата при разных config и неизменённых references.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createSourceMoveResolver } from "../src/createSourceMoveResolver.service.ts";

const from = "left/code/useTotal.util.ts",
  to = "right/code/useTotal.util.ts",
  target = "shared/calculateTotal.util.ts";
const config = (alias: string, target: string) =>
  JSON.stringify({
    compilerOptions: { baseUrl: ".", paths: { [alias]: [target] } },
  });
function fixture(finalConfig: string) {
  const texts = new Map([
    [from, "export function useTotal() {}"],
    [target, "export function calculateTotal() {}"],
    ["left/tsconfig.json", config("@app/*", "../shared/*")],
    ["right/tsconfig.json", finalConfig],
  ]);
  const readPaths = new Set<string>();
  const { resolveReference: resolve } = createSourceMoveResolver({
    files: new Set([from, target]),
    from,
    to,
    referenceRoots: ["left/code", "right/code", "shared"],
    readPaths,
    readReference(path) {
      const text = texts.get(path);
      if (text === undefined)
        throw Object.assign(new Error("Absent fixture source"), {
          code: "ENOENT",
        });
      return Buffer.from(text);
    },
  });
  return { resolve, readPaths };
}

test("перемещённый consumer использует новый effective config, сохраняя физическую цель", () => {
  const f = fixture(config("@new/*", "../shared/*"));
  assert.equal(
    f.resolve(from, to, "@app/calculateTotal.util"),
    "@new/calculateTotal.util",
  );
  for (const path of [
    "left/code/tsconfig.json",
    "right/code/tsconfig.json",
    "left/tsconfig.json",
    "right/tsconfig.json",
  ])
    assert.ok(f.readPaths.has(path));
});

test("новая config не может переключить reference на другую физическую цель", () => {
  const f = fixture(config("@app/*", "../wrong/*"));
  assert.throws(() => f.resolve(from, to, "@app/calculateTotal.util"), {
    code: "UNSUPPORTED",
  });
});

test("неизменённая relative reference сохраняет исходное написание после повторной проверки", () => {
  const f = fixture(config("@app/*", "../shared/*"));
  assert.equal(
    f.resolve(target, target, "./../shared/calculateTotal.util"),
    "./../shared/calculateTotal.util",
  );
});

test("без wildcard config effect сохраняется отказ при неоднозначном inverse", () => {
  const f = fixture(
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@app/*": ["../shared/*"], "@second/*": ["../shared/*"] },
      },
    }),
  );
  assert.throws(() => f.resolve(from, to, "@app/calculateTotal.util"), {
    code: "UNSUPPORTED",
  });
});

test("изменившаяся config в назначении не может получить source grant для внешней цели", () => {
  const f = fixture(config("@app/*", "../../external/*"));
  assert.throws(() => f.resolve(from, to, "@app/calculateTotal.util"), {
    code: "UNSUPPORTED",
  });
});

for (const variant of [
  "one config",
  "consumer config",
  "destination config",
  "incompatible baseUrl",
  "shadowed paths",
  "secondary moduleSuffixes",
])
  test(`inherited write проверяет весь inventory: ${variant}`, () => {
    const source = "left/code/calculateTotal.util.ts";
    const consumer = !["one config", "destination config"].includes(variant)
      ? "right/code/useTotal.util.ts"
      : "left/code/useTotal.util.ts";
    const destination = "left/pricing/calculateTotal.util.ts";
    const owner = "config/paths.json";
    const texts = new Map([
      [source, "export function calculateTotal() { return 42; }"],
      [consumer, 'import { calculateTotal } from "@total";'],
      ["left/tsconfig.json", '{"extends":"../config/paths"}'],
      ["right/tsconfig.json", '{"extends":"../config/paths"}'],
      [
        owner,
        JSON.stringify({
          compilerOptions: { baseUrl: "..", paths: { "@total": [source] } },
        }),
      ],
    ]);
    if (variant === "destination config")
      texts.set(
        "left/pricing/tsconfig.json",
        '{"extends":"../../config/paths"}',
      );
    const incompatible =
      variant === "incompatible baseUrl" ||
      variant === "shadowed paths" ||
      variant === "secondary moduleSuffixes";
    if (incompatible)
      texts.set(
        "right/tsconfig.json",
        JSON.stringify({
          extends: "../config/paths",
          compilerOptions:
            variant === "incompatible baseUrl"
              ? { baseUrl: "." }
              : variant === "shadowed paths"
                ? { paths: { "@total": [source] } }
                : { moduleSuffixes: [".native", ""] },
        }),
      );
    const readPaths = new Set<string>();
    const build = () =>
      createSourceMoveResolver({
        files: new Set([source, consumer]),
        from: source,
        to: destination,
        referenceRoots: ["left/code", "left/pricing", "right/code"],
        readPaths,
        tsconfigWrite: { path: owner, allConsumersInReferenceRoots: true },
        readReference(path) {
          const text = texts.get(path);
          if (text === undefined)
            throw Object.assign(new Error("Missing fixture file"), {
              code: "ENOENT",
            });
          return Buffer.from(text);
        },
      });
    // Совместимые configs получают один edit; вторичные ограничения не пропускаются.
    if (incompatible) assert.throws(build, { code: "UNSUPPORTED" });
    else {
      const result = build();
      assert.equal(
        result.resolveReference(consumer, consumer, "@total"),
        "@total",
      );
      assert.equal(result.configEdits.length, 1);
      assert.equal(result.configEdits[0].path, owner);
      assert.equal(
        JSON.parse(Buffer.from(result.configEdits[0].content).toString())
          .compilerOptions.paths["@total"][0],
        destination,
      );
      assert.ok(readPaths.has("left/pricing/tsconfig.json"));
      assert.ok(readPaths.has("left/tsconfig.json"));
      assert.ok(readPaths.has(owner));
    }
  });

function wildcardFixture(
  overrides: Record<string, string> = {},
  mappings: Record<string, readonly string[]> = {},
) {
  const source = "src/domain/calculate.util.ts",
    destination = "src/new-domain/calculate.util.ts";
  const consumer = "src/useTotal.util.ts",
    nested = "src/domain/detail/round.util.ts";
  const paths = {
    "@domain/*": ["./src/domain/*"],
    "@nested/*": ["src/domain/detail/*"],
    "@unused/*": ["src/domain/*"],
    "@exact": ["src/domain/calculate.util"],
    "@app/*": ["src/*"],
    ...mappings,
  };
  const texts = new Map(
    Object.entries({
      [source]: "export function calculate() { return 42; }",
      [nested]: "export function round() { return 1; }",
      [consumer]: "export function useTotal() { return 0; }",
      "tsconfig.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths },
      }),
      ...overrides,
    }),
  );
  const files = new Set(
    [...texts.keys()].filter((path) => !path.endsWith(".json")),
  );
  const reads = new Map<string, number>();
  const build = (from = "src/domain", to = "src/new-domain") =>
    createSourceMoveResolver({
      files,
      from,
      to,
      referenceRoots: ["src"],
      readPaths: new Set(),
      tsconfigWrite: {
        path: "tsconfig.json",
        allConsumersInReferenceRoots: true,
      },
      readReference(path) {
        reads.set(path, (reads.get(path) ?? 0) + 1);
        const text = texts.get(path);
        if (text === undefined)
          throw Object.assign(new Error("Missing fixture file"), {
            code: "ENOENT",
          });
        return Buffer.from(text);
      },
    });
  return { source, destination, consumer, nested, texts, paths, build, reads };
}

test("whole wildcard roots сохраняют specifiers; broad mapping и exact effect согласованы", () => {
  const f = wildcardFixture(),
    result = f.build();
  const paths = JSON.parse(
    Buffer.from(result.configEdits[0].content).toString(),
  ).compilerOptions.paths;
  assert.deepEqual(paths, {
    ...f.paths,
    "@domain/*": ["./src/new-domain/*"],
    "@nested/*": ["src/new-domain/detail/*"],
    "@unused/*": ["src/new-domain/*"],
    "@exact": ["src/new-domain/calculate.util"],
  });
  assert.equal(result.configEdits.length, 1);
  for (const reference of [
    "@domain/calculate.util",
    "@domain/calculate.util.js",
    "@domain/calculate.util.ts",
    "@unused/calculate.util",
    "@exact",
  ])
    assert.equal(
      result.resolveReference(f.consumer, f.consumer, reference),
      reference,
    );
  assert.equal(
    result.resolveReference(f.source, f.destination, "@nested/round.util"),
    "@nested/round.util",
  );
  assert.equal(
    result.resolveReference(
      f.consumer,
      f.consumer,
      "@app/domain/calculate.util",
    ),
    "@app/new-domain/calculate.util",
  );
});

test("частичный file move не переписывает wildcard root", () => {
  const f = wildcardFixture(),
    result = f.build(f.source, f.destination);
  const paths = JSON.parse(
    Buffer.from(result.configEdits[0].content).toString(),
  ).compilerOptions.paths;
  assert.deepEqual(paths["@domain/*"], f.paths["@domain/*"]);
  assert.deepEqual(paths["@nested/*"], f.paths["@nested/*"]);
});

test("exact shadowing сохраняет фактическую цель, wildcard proofs не присваивают чужой specifier", () => {
  const outside = "src/outside/calculate.util.ts";
  const f = wildcardFixture(
    { [outside]: "export function calculate() { return 7; }" },
    { "@domain/calculate.util": [outside] },
  );
  const result = f.build();
  assert.equal(
    result.resolveReference(f.consumer, f.consumer, "@domain/calculate.util"),
    "@domain/calculate.util",
  );
  assert.equal(
    result.resolveReference(
      f.consumer,
      f.consumer,
      "@domain/calculate.util.js",
    ),
    "@domain/calculate.util.js",
  );
  const paths = JSON.parse(
    Buffer.from(result.configEdits[0].content).toString(),
  ).compilerOptions.paths;
  assert.deepEqual(paths["@domain/calculate.util"], [outside]);
});

for (const [name, mapping] of [
  ["fallback", { "@bad/*": ["src/domain/*", "fallback/*"] }],
  ["target suffix", { "@bad/*": ["src/domain/*.js"] }],
  ["alias suffix", { "@bad/*.js": ["src/domain/*"] }],
  ["constant target", { "@bad/*": ["src/domain/calculate.util"] }],
  ["empty nested root", { "@bad/*": ["src/domain/empty/*"] }],
] as const)
  test(`affected wildcard shape ${name} блокирует plan`, () => {
    const f = wildcardFixture({}, mapping);
    assert.throws(() => f.build(), { code: "UNSUPPORTED" });
  });

test("неиспользуемый неоднозначный wildcard member блокирует effect", () => {
  const f = wildcardFixture({
    "src/domain/unused.service.ts": "export function unused() {}",
    "src/domain/unused.service.js": "export function unused() {}",
  });
  assert.throws(() => f.build(), { code: "UNSUPPORTED" });
});

test("wildcard proof expansion ограничена общим graphEntries budget", () => {
  const f = wildcardFixture(
    Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        `src/domain/member${i}.util.ts`,
        "export {};",
      ]),
    ),
    Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`@alias${i}/*`, ["src/domain/*"]]),
    ),
  );
  assert.throws(() => f.build(), { code: "LIMIT_EXCEEDED" });
});

test("wildcard member proofs включают JS/JSX и native расширения согласованных profiles", () => {
  const f = wildcardFixture({
    "src/domain/resolveTotal.service.js": "export {};",
    "src/domain/Price.component.tsx": "export {};",
    "src/domain/Badge.component.jsx": "export {};",
    "src/domain/Price.types.ts": "export {};",
  });
  const result = f.build();
  for (const reference of [
    "@domain/resolveTotal.service.js",
    "@domain/Price.component.jsx",
    "@domain/Price.component.tsx",
    "@domain/Badge.component",
    "@domain/Price.types",
  ])
    assert.equal(
      result.resolveReference(f.consumer, f.consumer, reference),
      reference,
    );
});
