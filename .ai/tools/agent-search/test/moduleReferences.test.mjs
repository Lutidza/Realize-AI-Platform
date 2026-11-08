/**
 * @file .ai/tools/agent-search/test/moduleReferences.test.mjs
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет общий AST extractor и его границу между поисковой выдачей и строгими mutation consumers.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import { parseSyntaxSource } from "../src/parseSyntaxSource.util.mjs";
import { readSyntaxModuleReference } from "../src/readSyntaxModuleReference.util.mjs";
import { analyzeSyntaxFile } from "../src/analyzeSyntaxFile.util.mjs";

test("общий extractor сохраняет literal offsets и не теряет неподдержанные computed/require формы", () => {
  const text = [
    'import { x as local } from "./value.js";',
    "export { local as result };",
    'export * from "./barrel";',
    'type Value = import("./types").Value;',
    'import legacy = require("./legacy");',
    'const a = import("./dynamic", { with: { type: "json" } });',
    "const b = import(variable);",
    'const c = require("./common");',
    'const d = require.resolve("./location");',
    'const e = module.require("./other");',
  ].join("\n");
  const parsed = parseSyntaxSource("sample.ts", text);
  assert.equal(parsed.status, "parsed");
  const references = [];
  const visit = (node) => {
    const reference = readSyntaxModuleReference(node);
    if (reference) references.push(reference);
    ts.forEachChild(node, visit);
  };
  visit(parsed.source);
  assert.equal(references.length, 9);
  assert.equal(
    references.filter((r) => r.form === "require_property").length,
    2,
  );
  assert.ok(
    references.some((r) => r.specifier?.getText(parsed.source) === "variable"),
  );
  for (const reference of references)
    assert.equal(
      text.slice(
        reference.specifier.getStart(parsed.source),
        reference.specifier.end,
      ),
      reference.specifier.getText(parsed.source),
    );
  const found = analyzeSyntaxFile("sample.ts", text, {
    intent: "imports",
    query: "*",
    caseSensitive: true,
  });
  assert.equal(found.status, "parsed");
  assert.deepEqual(
    [...found.matches].map((m) => m.syntax.moduleSpecifier),
    ["./value.js", "./barrel", "./types", "./legacy", "./dynamic", "./common"],
  );
});

test("ошибочный syntax не становится разрешением переписывать восстановленный AST", () => {
  assert.equal(
    parseSyntaxSource("sample.ts", 'import { x from "./value"').status,
    "syntax_error",
  );
});
