/**
 * @file .ai/tools/agent-search/test/syntaxNavigation.test.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Проверяет реальные конструкции TS/JS, Unicode и границы синтаксической точности.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSyntaxFile } from "../src/analyzeSyntaxFile.util.mjs";
import { SYNTAX_MAX_FILE_BYTES } from "../src/syntaxSearch.config.mjs";

const analyze = (text, query, intent = "definitions", options = {}) => {
  const result = analyzeSyntaxFile("fixture.tsx", text, {
    query,
    intent,
    caseSensitive: true,
    ...options,
  });
  return { ...result, matches: [...result.matches] };
};

test("объявления отличаются от комментариев, imports, строк и похожих имён", () => {
  const code =
    '// Needle\nimport { Needle } from "lib";\nconst NeedleOptions = "Needle";\nexport function Needle() { return Needle(); }\n';
  const definitions = analyze(code, "Needle").matches;
  assert.equal(definitions.length, 1);
  assert.deepEqual(definitions[0].syntax, { kind: "function", name: "Needle" });
  assert.equal(definitions[0].line, 4);
  const references = analyze(code, "Needle", "references").matches;
  assert.equal(references.length, 1);
  assert.equal(references[0].offset, code.indexOf("Needle();"));
});

test("находит classes/methods/accessors/types/properties/destructuring и function expressions", () => {
  const code =
    "class Store { #value = 0; read() {} get size() { return 1; } }\ninterface Shape { key: string; method(): void }\ntype Name = string; enum State { Ready }\nconst { old: local } = source; const f = function named() {};";
  for (const [query, kind] of [
    ["Store", "class"],
    ["#value", "property"],
    ["read", "method"],
    ["size", "method"],
    ["Shape", "interface"],
    ["key", "property"],
    ["method", "method"],
    ["Name", "type"],
    ["State", "enum"],
    ["Ready", "property"],
    ["local", "variable"],
    ["named", "function"],
  ])
    assert.equal(analyze(code, query).matches[0]?.syntax.kind, kind, query);
  assert.equal(analyze(code, "old").matches.length, 0);
});

test("references сохраняют usages и shadowing без ложного обещания symbol resolution", () => {
  const code =
    "const item = 1; function f(item: number) { return {item}; } object.item;";
  assert.equal(analyze(code, "item").matches.length, 2);
  assert.equal(analyze(code, "item", "references").matches.length, 2);
});

test("JSX tags учитываются один раз; attributes, текст JSX и closing tags исключены", () => {
  const code =
    'const view = <UI.Button Button="Button">Button<Button /></UI.Button>;';
  assert.equal(analyze(code, "Button", "references").matches.length, 2);
});

test("import aliases и re-exports возвращают module и локальное/исходное имя", () => {
  const code =
    'import Default, { source as local } from "./source"; export { source as publicName } from "./barrel";';
  for (const query of ["source", "local"]) {
    const first = analyze(code, query, "imports").matches[0];
    assert.deepEqual(first.syntax, {
      kind: "import",
      moduleSpecifier: "./source",
      name: "local",
      importedName: "source",
    });
  }
  assert.deepEqual(analyze(code, "publicName", "imports").matches[0].syntax, {
    kind: "export",
    moduleSpecifier: "./barrel",
    name: "publicName",
    importedName: "source",
  });
  assert.equal(analyze(code, "source", "references").matches.length, 1);
  assert.equal(analyze(code, "publicName", "references").matches.length, 0);
});

test("static/module imports, namespace, TS import-equals, dynamic import и require", () => {
  const code =
    'import "./setup"; import * as kit from "./ui"; import old = require("./legacy"); const a = import("./dynamic", { with: { type: "json" } }); const b = require("./cjs"); type T = import("./types").T; import(variable); require(prefix + "/computed");';
  for (const [query, kind] of [
    ["setup", "import"],
    ["kit", "import"],
    ["old", "import"],
    ["dynamic", "dynamic_import"],
    ["cjs", "require"],
    ["types", "import"],
  ])
    assert.equal(
      analyze(code, query, "imports").matches[0]?.syntax.kind,
      kind,
      query,
    );
  assert.equal(analyze(code, "computed", "imports").matches.length, 0);
  assert.equal(analyze(code, "*", "imports").matches.length, 6);
});

test("English, русский, ქართული, العربية, 漢字 и combining identifiers с BOM/CRLF", () => {
  for (const name of [
    "English",
    "Русский",
    "ქართული",
    "العربية",
    "漢字",
    "e\u0301",
  ]) {
    const code = `\uFEFF/*👩🏽‍💻 e\u0301*/ export const ${name} = 1;\r\n${name};\r\n`;
    const result = analyze(code, name);
    assert.equal(result.status, "parsed", name);
    assert.equal(
      result.matches[0]?.offset,
      code.indexOf(name, code.indexOf("export const")),
      name,
    );
    assert.equal(analyze(code, name, "references").matches[0]?.line, 2);
  }
  assert.equal(analyze("const e\u0301 = 1;", "é").matches.length, 0);
});

test("регистр и escaped Unicode identifiers сопоставляются по имени без смещения координат", () => {
  const code = "const ENGLISH = 1, РУССКИЙ = 2, İ = 3; const \\u0061lias = 4;";
  for (const query of ["english", "русский", "i\u0307"]) {
    assert.equal(analyze(code, query).matches.length, 0);
    assert.equal(
      analyze(code, query, "definitions", { caseSensitive: false }).matches
        .length,
      1,
    );
  }
  const escaped = analyze(code, "alias").matches[0];
  assert.equal(escaped.offset, code.indexOf("\\u0061"));
});

test("контекстный регистр Unicode не теряет объявления и usages при prefilter", () => {
  for (const [code, intent, nameStart] of [
    ["const model={'ΟΣ':Foo};", "definitions", "'ΟΣ'"],
    ["const value = ΟΣ.Foo;", "references", "ΟΣ"],
  ]) {
    const result = analyze(code, "ος", intent, { caseSensitive: false });
    assert.equal(result.status, "parsed");
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].syntax.name, "ΟΣ");
    assert.equal(result.matches[0].offset, code.indexOf(nameStart));
  }
});

test("числовые имена свойств ищутся по имени AST, даже если исходный literal другой", () => {
  for (const [literal, name] of [
    ["1_000", "1000"],
    ["0xff", "255"],
    ["0b100", "4"],
    [".5", "0.5"],
    ["1e999", "Infinity"],
  ]) {
    const code = `const model = {${literal}: true};`;
    for (const caseSensitive of [true, false]) {
      const result = analyze(
        code,
        caseSensitive ? name : name.toLowerCase(),
        "definitions",
        { caseSensitive },
      );
      assert.equal(result.status, "parsed");
      assert.equal(result.matches.length, 1);
      assert.equal(result.matches[0].syntax.name, name);
      assert.equal(result.matches[0].offset, code.indexOf(literal));
    }
  }
});

test("syntax errors/unsupported/oversize явные; обход прекращается потребителем или отменой", () => {
  assert.equal(analyze("function broken( {", "broken").status, "syntax_error");
  assert.equal(
    analyzeSyntaxFile("a.py", "def a(): pass", {
      query: "a",
      intent: "definitions",
      caseSensitive: true,
    }).status,
    "unsupported",
  );
  assert.equal(
    analyze(" ".repeat(SYNTAX_MAX_FILE_BYTES + 1), "a").status,
    "size",
  );
  const large = "item;".repeat(20000);
  let checked = 0;
  const result = analyzeSyntaxFile("a.ts", large, {
    query: "item",
    intent: "references",
    caseSensitive: true,
    assertActive: () => {
      if (++checked > 2) throw new Error("cancelled");
    },
  });
  assert.equal(result.matches.next().done, false);
  assert.throws(() => [...result.matches], /cancelled/);
});

test("безопасный prefilter не парсит посторонний файл и сохраняет escaped имена и imports", () => {
  assert.equal(analyze("const unrelated = 1;", "Needle").status, "prefiltered");
  assert.equal(
    analyze("const unrelated = 1;", "Needle", "definitions", {
      caseSensitive: false,
    }).status,
    "prefiltered",
  );
  assert.equal(
    analyze('import x from "\\x6dod";', "mod", "imports").matches.length,
    1,
  );
  assert.equal(
    analyze("const \\u004e e = 1;", "Needle").status,
    "syntax_error",
  );
});

test("U+2028/U+2029 и одиночный CR не меняют LF-координаты транспорта", () => {
  const code =
    "const one = 1;\u2028const two = 2;\u2029const three = 3;\rconst Needle = 4;";
  const match = analyze(code, "Needle").matches[0];
  assert.equal(match.line, 1);
  assert.equal(match.character, code.indexOf("Needle"));
});
