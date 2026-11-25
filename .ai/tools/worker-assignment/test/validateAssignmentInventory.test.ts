/**
 * @file .ai/tools/worker-assignment/test/validateAssignmentInventory.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет отказы при неполном, расширенном или недоступном каталоге MCP сессии.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAssignmentInventory } from "../src/validateAssignmentInventory.validator";

test("подтверждаются только один подключённый reader, полный каталог и точные пути без повторов", () => {
  const paths = ["src/a.ts", "src/b.ts"];
  const tool = {
    name: "repo_read_file",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string", enum: paths.toReversed() } },
    },
  };
  const server = {
    name: "realize_assignment",
    runtimeStatus: "connected",
    toolsError: null,
    resources: [],
    resourceTemplates: [],
    tools: { repo_read_file: tool },
  };
  assert(
    validateAssignmentInventory({ data: [server], nextCursor: null }, paths),
  );
  for (const inventory of [
    { data: [server], nextCursor: "next" },
    { data: [server, server], nextCursor: null },
    ...[
      { tools: { ...server.tools, search: tool } },
      { toolsError: "unavailable" },
      { runtimeStatus: "starting" },
      { resources: [{}] },
      { resourceTemplates: [{}] },
    ].map((change) => ({ data: [{ ...server, ...change }], nextCursor: null })),
  ])
    assert.equal(validateAssignmentInventory(inventory, paths), false);
  for (const mismatch of [
    [paths[0]],
    [...paths, paths[0]],
    ["src/extra.ts", paths[0]],
  ])
    assert.equal(
      validateAssignmentInventory(
        { data: [server], nextCursor: null },
        mismatch,
      ),
      false,
    );
});
