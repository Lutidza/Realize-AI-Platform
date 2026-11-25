/**
 * @file .ai/tools/worker-assignment/test/inspectResponsesToolCatalog.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет приём каталогов Responses и Responses Lite на локальных JSON-примерах.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inspectResponsesToolCatalog } from "../src/inspectResponsesToolCatalog.validator";

const lock = new URL("../article-audit.lock.json", import.meta.url);
const paths = Object.keys(JSON.parse(readFileSync(lock, "utf8")).files);
const outside = "fixtures/outside-the-assignment.md";
assert.equal(paths.length, 18);
assert(!paths.includes(outside));

function reader(allowed: string[], name = "repo_read_file") {
  return {
    type: "function",
    name,
    parameters: {
      type: "object",
      properties: { path: { type: "string", enum: allowed } },
      required: ["path"],
    },
  };
}

const namespace = (tools: unknown[]) => ({
  type: "namespace",
  name: "mcp__realize_assignment",
  tools,
});
const additional = (tools: unknown[]) => ({
  type: "additional_tools",
  role: "developer",
  tools,
});
const message = {
  type: "message",
  role: "user",
  content: "Только локальный JSON-пример.",
};
const extra = { type: "tool_search" };

function inspect(body: unknown) {
  return inspectResponsesToolCatalog(JSON.parse(JSON.stringify(body)), paths);
}

for (const lite of [false, true]) {
  const format = lite ? "Responses Lite" : "Responses";
  function request(allowed?: string[], extras: unknown[] = []) {
    if (!allowed) return { input: lite ? [message] : message.content };
    if (lite)
      return {
        input: [message, additional([namespace([reader(allowed)]), ...extras])],
      };
    return {
      input: [message],
      tools: [
        reader(allowed, "mcp__realize_assignment__repo_read_file"),
        ...extras,
      ],
    };
  }
  test(format + " — один reader, точно 18 путей", () => {
    const report = inspect(request(paths.toReversed()));
    assert.equal(report.onlyReader, true);
    assert.equal(report.reason, null);
    assert.equal(report.readerVerified, true);
    assert.equal(report.tools.length, 1);
    assert.equal(report.tools[0].enumCount, 18);
    assert.equal(
      report.catalogLocation,
      lite ? "input[].additional_tools.tools" : "tools",
    );
  });
  test(format + " — лишний инструмент", () => {
    const report = inspect(request(paths, [extra]));
    assert.equal(report.readerVerified, true);
    assert.equal(report.onlyReader, false);
    assert.equal(report.reason, "unexpected_tool");
    assert.deepEqual(
      report.tools.map((tool) => tool.type),
      ["function", "tool_search"],
    );
  });
  test(format + " — подмена одного из 18 путей", () => {
    const report = inspect(request([outside, ...paths.slice(1)]));
    assert.equal(report.tools[0].enumCount, 18);
    assert.equal(report.readerVerified, false);
    assert.equal(report.onlyReader, false);
    assert.equal(report.reason, "path_mismatch");
  });
  test(format + " — каталог отсутствует", () => {
    const report = inspect(request());
    assert.equal(report.onlyReader, false);
    assert.equal(report.reason, "catalog_missing");
    assert.equal(report.catalogLocation, null);
    assert.equal(report.toolCatalogSha256, null);
  });
}

test("Тексты сообщений исключены из каталога и результата", () => {
  const fake = JSON.stringify(additional([extra]));
  const content = [{ type: "input_text", text: fake }];
  const input = [{ ...message, content, tools: [extra] }];
  assert.equal(
    inspect({ input, instructions: fake }).reason,
    "catalog_missing",
  );
  const report = inspect({
    input: [...input, additional([namespace([reader(paths)])])],
  });
  assert(report.onlyReader);
  assert(!JSON.stringify(report).includes(fake));
  assert(!JSON.stringify(report).includes(paths[0]));
});

test("SHA-256 каталога одинаков при перестановке ключей и смене формата запроса", () => {
  const tool = reader(paths);
  const reordered = {
    parameters: tool.parameters,
    name: tool.name,
    type: tool.type,
  };
  const standard = inspect({ tools: [namespace([tool])] });
  const lite = inspect({ input: [additional([namespace([reordered])])] });
  assert.match(standard.toolCatalogSha256 ?? "", /^[0-9a-f]{64}$/);
  assert.equal(standard.toolCatalogSha256, lite.toolCatalogSha256);
});

test("Смешанные, неполные и повторные объявления блокируются", () => {
  const spec = namespace([reader(paths)]);
  const declaration = additional([spec]);
  for (const body of [
    { tools: [spec], input: [declaration] },
    { input: [{ ...declaration, role: "user" }] },
    { tools: null },
    { input: [{ ...declaration, tools: null }] },
    { tools: [spec, {}] },
    { tools: [namespace([])] },
    { tools: [namespace([{ ...reader(paths), type: undefined }])] },
    { input: [declaration, declaration] },
    { input: [declaration, additional([extra])] },
    { tools: [] },
    { tools: [namespace([reader(paths), { type: "custom", name: "extra" }])] },
  ])
    assert.equal(inspect(body).onlyReader, false);
});
