/**
 * @file .ai/tools/worker-assignment/test/preflightAssignment.test.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Проверяет отчёт preflight на локальном транспорте с правами примера аудита статьи.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { preflightAssignment } from "../src/preflightAssignment.service";
import { articleAuditFixture, lockPath } from "./articleAudit.fixture";

test("версия сессии сохраняется при отказе по правам и не изменяет допуск", async (t) => {
  const f = await articleAuditFixture(t);
  const paths = Object.keys(f.lock.files);
  assert.equal(paths.length, 18);
  const reader = {
    name: "repo_read_file",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string", enum: paths } },
    },
  };
  for (const cliVersion of ["0.162.1", "1.3.0-rc.2", null]) {
    for (const extraTool of [false, true]) {
      const reads: string[] = [];
      let closed = false;
      const report = await preflightAssignment(
        f.policy,
        lockPath,
        f.contextId,
        async () => ({
          threadId: "fixture",
          cliVersion,
          list: async () => ({
            data: [
              {
                name: "realize_assignment",
                runtimeStatus: "connected",
                toolsError: null,
                tools: {
                  repo_read_file: reader,
                  ...(extraTool ? { shell: {} } : {}),
                },
                resources: [],
                resourceTemplates: [],
              },
            ],
            nextCursor: null,
          }),
          call: async (name, args) => {
            const { path } = args as { path?: string };
            if (name === reader.name && path && paths.includes(path)) {
              reads.push(path);
              return {
                structuredContent: {
                  path,
                  text: "fixture",
                  startLine: 1,
                  version: { sha256: f.lock.files[path] },
                },
              };
            }
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text:
                    name === reader.name
                      ? "path validation failed"
                      : "Unknown tool",
                },
              ],
            };
          },
          close: async () => {
            closed = true;
          },
        }),
      );
      assert.equal(report.cliVersion, cliVersion);
      assert.equal(report.status, "blocked");
      assert.equal(
        report.issues[0].code,
        extraTool ? "transport_access_mismatch" : "native_tools_unverified",
      );
      assert.deepEqual(reads.toSorted(), extraTool ? [] : paths.toSorted());
      assert("evidence" in report);
      assert.equal(report.evidence.executor.observedVersion, cliVersion);
      assert.equal(
        report.evidence.access.coverage,
        extraTool ? "unknown" : "partial",
      );
      assert.equal(report.evidence.access.routes, null);
      assert.equal(report.evidence.binding, null);
      assert.equal(report.evidence.preparedSources.length, 6);
      assert.deepEqual(
        report.evidence.access.readPaths?.toSorted() ?? null,
        extraTool ? null : paths.toSorted(),
      );
      assert(closed);
    }
  }
});
