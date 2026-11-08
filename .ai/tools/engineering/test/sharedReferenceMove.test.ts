/**
 * @file .ai/tools/engineering/test/sharedReferenceMove.test.ts
 * @version 1.0.1
 * @date 2026-10-29
 * @description Проверяет согласованность общего Markdown extractor и строгого rewrite при Unicode, code examples и неоднозначных imports.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readMarkdownLinks,
  readMarkdownLinkSpans,
  readMarkdownAnchors,
} from "../../quality/readMarkdownLinks.util.ts";
import { rewriteTemplateMove } from "../src/rewriteTemplateMove.util.ts";
import { rewriteSourceMove as rewriteWithResolver } from "../src/rewriteSourceMove.util.ts";
import { createSourceMoveResolver } from "../src/createSourceMoveResolver.service.ts";
import type { ArtifactMoveTextInput } from "../src/ProjectArtifactMove.types.ts";
import { renderAiTemplate } from "../src/renderAiTemplate.util.ts";

test("общий Markdown extractor сохраняет UTF-16 offsets и исключает все code examples", () => {
  const examples = [
    "``[inline](missing.md) ` code``",
    "   ````md\n[пример](missing.md)\n   `````",
    "    [indented](missing.md)",
    "\t[tab](missing.md)",
  ].join("\n\n");
  const text =
    '---\nexample: "[meta](missing.md)"\n---\n# `Контракт`\n\n😀 [Ссылка](<цель.md#якорь>)\n\n' +
    examples +
    '\n\n[ref]: цель.md "Описание"\n';
  const spans = readMarkdownLinkSpans(text);
  assert.deepEqual(readMarkdownLinks(text), ["цель.md#якорь", "цель.md"]);
  for (const span of spans)
    assert.equal(text.slice(span.start, span.end), span.target);
  const repeated = "😀 [цель.md](цель.md)";
  assert.deepEqual(readMarkdownLinkSpans(repeated), [
    {
      target: "цель.md",
      start: repeated.indexOf("](цель.md)") + 2,
      end: repeated.length - 1,
    },
  ]);
  assert.ok(readMarkdownAnchors(text).has("контракт"));
});

test("rewrite и validation используют одинаковые ссылки; сохранены CRLF, emoji, anchors и примеры", () => {
  const path = ".ai/templates/scope/TEMPLATE-CONSUMER.md";
  const examples =
    "``[Пример](old/TEMPLATE-VALUE.md)``\n\n   ````md\n[Пример](old/TEMPLATE-VALUE.md)\n   `````\n\n    [Пример](old/TEMPLATE-VALUE.md)";
  const source = Buffer.from(
    renderAiTemplate({
      path,
      templateId: "TEMPLATE-CONSUMER",
      titleRu: "Потребитель",
      purposeRu: "Проверяет связи.",
      usageRu: "Применяется в проверке.",
      sections: [
        {
          headingRu: "Ссылки",
          body:
            '😀 [Цель](old/TEMPLATE-VALUE.md#назначение)\n\n[ref]: <old/TEMPLATE-VALUE.md> "Цель"\n\n' +
            examples,
        },
      ],
      relatedArtifacts: [],
    }),
  )
    .toString("utf8")
    .replaceAll("\n", "\r\n");
  const result = rewriteTemplateMove({
    path,
    finalPath: path,
    source,
    from: ".ai/templates/scope/old",
    to: ".ai/templates/scope/new",
    files: new Set(),
    changedOn: "2026-10-29",
  });
  assert.deepEqual(readMarkdownLinks(result), [
    "new/TEMPLATE-VALUE.md#назначение",
    "new/TEMPLATE-VALUE.md",
  ]);
  assert.ok(result.includes(examples.replaceAll("\n", "\r\n")));
  assert.ok(result.includes("😀"));
  assert.equal(result.replaceAll("\r\n", "").includes("\n"), false);
});

test("общие кандидаты не ослабляют однозначность mutation inventory", () => {
  const path = "src/consumer.util.ts";
  const context = {
    path,
    finalPath: path,
    source: 'import value from "./old/value.util.js";',
    from: "src/old",
    to: "src/new",
    files: new Set(["src/old/value.util.ts", "src/old/value.util.js"]),
    changedOn: "2026-10-29",
  };
  assert.throws(() => rewriteSourceMove(context), { code: "UNSUPPORTED" });
  context.files.delete("src/old/value.util.js");
  assert.match(rewriteSourceMove(context), /"\.\/new\/value\.util\.js"/);
});

for (const source of [
  "const x = import(path);",
  'import x = require("./old/value.util");',
  'const x = require.resolve("./old/value.util");',
  'const x = module.require("./old/value.util");',
  'const x = import("./old/value.util", {});',
  'import x from "@/old/value.util";',
  'import { x from "./old/value.util";',
])
  test(`неподдержанная форма останавливает rewrite: ${source}`, () => {
    assert.throws(
      () =>
        rewriteSourceMove({
          path: "src/consumer.util.ts",
          finalPath: "src/consumer.util.ts",
          source,
          from: "src/old",
          to: "src/new",
          files: new Set(["src/old/value.util.ts"]),
          changedOn: "2026-10-29",
        }),
      { code: "UNSUPPORTED" },
    );
  });

function rewriteSourceMove(input: ArtifactMoveTextInput) {
  return rewriteWithResolver({
    ...input,
    resolveReference: createSourceMoveResolver({
      ...input,
      referenceRoots: ["src"],
      readPaths: new Set(),
      readReference(path) {
        if (input.files.has(path)) return Buffer.from("export {};");
        throw Object.assign(new Error("Missing fixture file"), {
          code: "ENOENT",
        });
      },
    }).resolveReference,
  });
}
