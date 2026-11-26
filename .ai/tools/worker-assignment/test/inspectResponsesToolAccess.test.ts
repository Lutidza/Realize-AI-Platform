/**
 * @file .ai/tools/worker-assignment/test/inspectResponsesToolAccess.test.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Проверяет доступ к файлам временного назначения по прямым, отложенным и вложенным маршрутам Responses.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, type TestContext } from "node:test";
import { inspectResponsesToolAccess } from "../src/inspectResponsesToolAccess.validator";
import {
  createTemporaryAssignment,
  requiredSources,
} from "./temporaryAssignment.fixture";

const example = readFileSync(
  new URL("./responsesLiteRoutes.fixture.json", import.meta.url),
  "utf8",
);
const entryPath = "src/module/entry.ts";
const field = "x-codex-turn-metadata";
const ns = "mcp__realize_assignment";
const mcpSource = { kind: "mcp", server_name: "realize_assignment" };

async function inspectorForAssignment(t: TestContext, paths = [entryPath]) {
  const { lock } = await createTemporaryAssignment(t, {
    reviewScope: { paths },
  });
  const allowedPaths = Object.keys(lock.files);
  return (body: unknown) => inspectResponsesToolAccess(body, allowedPaths);
}

function withMetadata(body: object, info: unknown) {
  return {
    ...body,
    client_metadata: {
      [field]: JSON.stringify({ tool_namespaces_info: info }),
    },
  };
}
function fixtureInfo() {
  return JSON.parse(JSON.parse(example).client_metadata[field])
    .tool_namespaces_info;
}
function directReader(allowedPaths: string[]) {
  const body = {
    tools: [
      {
        type: "namespace",
        name: ns,
        tools: [
          {
            type: "function",
            name: "repo_read_file",
            parameters: {
              type: "object",
              properties: { path: { type: "string", enum: allowedPaths } },
              required: ["path"],
            },
          },
        ],
      },
    ],
  };
  const entry = {
    name: "repo_read_file",
    direct: true,
    deferred: false,
    code_mode_name: null,
    source: mcpSource,
  };
  return {
    body,
    info: { [ns]: { name: ns, functions: { repo_read_file: entry } } },
  };
}

test("три прямых инструмента согласованы, reader и ресурсы доступны через exec только по метаданным примера", async (t) => {
  const inspect = await inspectorForAssignment(t);
  const report = inspect(JSON.parse(example));
  assert.equal(report.status, "blocked");
  assert.equal(report.reason, "unexpected_tool");
  assert.equal(report.onlyReader, false);
  assert.equal(report.readerVerified, false);
  assert.equal(report.comparison.reason, null);
  assert.deepEqual(
    report.routes
      .filter((r) => r.direct)
      .map((r) => r.name)
      .sort(),
    ["functions.exec", "functions.request_user_input_async", "functions.wait"],
  );
  assert.deepEqual(
    report.routes
      .filter((r) => r.code_mode_name !== null)
      .map((r) => r.code_mode_name)
      .sort(),
    [
      "list_mcp_resource_templates",
      "list_mcp_resources",
      "mcp__realize_assignment__repo_read_file",
      "read_mcp_resource",
    ],
  );
  assert.deepEqual(
    report.routes.find((r) => r.name === ns + ".repo_read_file"),
    {
      name: ns + ".repo_read_file",
      direct: false,
      deferred: false,
      code_mode_name: "mcp__realize_assignment__repo_read_file",
      source: mcpSource,
    },
  );
});

test("единственный прямой reader требует точного enum и подтверждённого источника для одного и нескольких файлов", async (t) => {
  for (const paths of [[entryPath], [entryPath, "src/shared/entry.ts"]]) {
    const inspect = await inspectorForAssignment(t, paths);
    const { body, info } = directReader([...requiredSources, ...paths]);
    const report = inspect(withMetadata(body, info));
    assert.equal(report.status, "verified");
    assert.equal(report.onlyReader, true);

    const substituted = directReader([
      ...requiredSources,
      "src/module/draft.ts",
      ...paths.slice(1),
    ]);
    const mismatch = inspect(withMetadata(substituted.body, info));
    assert.equal(mismatch.status, "blocked");
    assert.equal(mismatch.reason, "path_mismatch");

    info[ns].functions.repo_read_file.source = {
      kind: "mcp",
      server_name: "another_server",
    };
    const wrongSource = inspect(withMetadata(body, info));
    assert.equal(wrongSource.status, "blocked");
    assert.equal(wrongSource.reason, "reader_source_mismatch");
  }
});

test("отсутствующие и повреждённые метаданные блокируют допуск даже при точном прямом каталоге", async (t) => {
  const inspect = await inspectorForAssignment(t);
  const { body, info } = directReader([...requiredSources, entryPath]);
  const misplaced = {
    ...body,
    headers: { [field]: JSON.stringify({ tool_namespaces_info: info }) },
  };
  assert.equal(inspect(misplaced).reason, "metadata_missing");
  for (const bad of ["{", "null", { tool_namespaces_info: info }]) {
    assert.equal(
      inspect({ ...body, client_metadata: { [field]: bad } }).reason,
      "metadata_invalid",
    );
  }
  info[ns].name = "another_namespace";
  assert.equal(inspect(withMetadata(body, info)).reason, "metadata_invalid");
});

test("прямые записи сверяются в обе стороны, для вложенного reader нужен прямой exec", async (t) => {
  const inspect = await inspectorForAssignment(t);
  const body = JSON.parse(example);
  const info = fixtureInfo();
  info.functions.functions.wait.direct = false;
  info.functions.functions.wait.code_mode_name = "wait";
  info[ns].functions.repo_read_file.direct = true;
  const report = inspect(withMetadata(body, info));
  assert.equal(report.reason, "route_mismatch");
  assert.deepEqual(report.comparison.onlyInCatalog, ["functions.wait"]);
  assert.deepEqual(report.comparison.onlyInMetadata, [ns + ".repo_read_file"]);

  body.input[0].tools[0].tools.shift();
  delete info.functions.functions.exec;
  assert.deepEqual(
    inspect(withMetadata(body, info)).comparison.missingGateways,
    ["functions.exec"],
  );
});

test("маршрут deferred требует прямого tool_search, а совпадение имён Code Mode блокирует неоднозначный отчёт", async (t) => {
  const inspect = await inspectorForAssignment(t);
  const body = JSON.parse(example);
  const info = fixtureInfo();
  const reader = info[ns].functions.repo_read_file;
  reader.deferred = true;
  assert.deepEqual(
    inspect(withMetadata(body, info)).comparison.missingGateways,
    ["tool_search.tool_search_tool"],
  );
  body.input[0].tools.push({ type: "tool_search" });
  info.tool_search = {
    name: "tool_search",
    functions: {
      tool_search_tool: {
        name: "tool_search_tool",
        direct: true,
        deferred: false,
        code_mode_name: null,
        source: { kind: "harness" },
      },
    },
  };
  assert.equal(inspect(withMetadata(body, info)).comparison.reason, null);
  reader.code_mode_name = "read_mcp_resource";
  assert.equal(inspect(withMetadata(body, info)).reason, "metadata_invalid");
});
