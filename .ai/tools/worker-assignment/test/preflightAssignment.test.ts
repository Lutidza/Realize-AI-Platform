/**
 * @file .ai/tools/worker-assignment/test/preflightAssignment.test.ts
 * @version 1.1.1
 * @date 2026-11-26
 * @description Проверяет права временного назначения и причину отказа preflight на локальном транспорте.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { BoundAssignment } from "../src/admission/AssignmentAdmission.types";
import { bindAssignment } from "../src/bindAssignment.service";
import { preflightAssignment } from "../src/preflightAssignment.service";
import {
  createTemporaryAssignment,
  requiredSources,
} from "./temporaryAssignment.fixture";

/** Имитирует каталог MCP и передаёт разрешённые чтения обработчику временного контекста. */
function createPreflightSession(
  context: BoundAssignment["context"],
  cliVersion: string | null,
  extraTool: boolean,
) {
  const paths = Object.keys(context.readPins);
  const reads: string[] = [];
  const reader = {
    name: "repo_read_file",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string", enum: paths } },
    },
  };
  return {
    threadId: "fixture",
    cliVersion,
    reads,
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
    call: async (name: string, args: unknown) => {
      const { path } = args as { path?: string };
      if (name === reader.name && path && paths.includes(path)) {
        reads.push(path);
        return { structuredContent: await context.callTool(name, args) };
      }
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              name === reader.name ? "path validation failed" : "Unknown tool",
          },
        ],
      };
    },
    close: mock.fn(async () => {}),
  };
}

test("preflight проверяет права выбранных файлов и сохраняет версию сессии при отказе", async (t) => {
  const entry = "src/module/entry.ts";
  for (const reviewPaths of [[entry], [entry, "src/shared/entry.ts"]]) {
    const { policy, lockPath, lock } = await createTemporaryAssignment(t, {
      reviewScope: { paths: reviewPaths },
    });
    const bound = await bindAssignment(policy, lockPath);
    assert(bound.context, JSON.stringify(bound.report.issues));
    const expectedPaths = [...requiredSources, ...reviewPaths].toSorted();
    const expectedSources = requiredSources.map((path) => ({
      path,
      sha256: lock.files[path],
    }));

    for (const cliVersion of ["1.0.0", "1.3.0-rc.2", null]) {
      for (const extraTool of [false, true]) {
        const session = createPreflightSession(
          bound.context,
          cliVersion,
          extraTool,
        );
        const report = await preflightAssignment(
          policy,
          lockPath,
          bound.context.contextId,
          async () => session,
        );

        assert.equal(report.status, "blocked");
        assert.equal(
          report.issues[0].code,
          extraTool ? "transport_access_mismatch" : "native_tools_unverified",
        );
        assert.equal(report.cliVersion, cliVersion);
        assert("evidence" in report);
        const { evidence } = report;
        assert.equal(evidence.executor.observedVersion, cliVersion);
        assert.equal(evidence.binding, null);
        assert.equal(evidence.access.routes, null);
        assert.equal(
          evidence.access.coverage,
          extraTool ? "unknown" : "partial",
        );
        assert.deepEqual(
          evidence.preparedSources.map(({ path, sha256 }) => ({
            path,
            sha256,
          })),
          expectedSources,
        );
        assert.deepEqual(
          session.reads.toSorted(),
          extraTool ? [] : expectedPaths,
        );
        assert.deepEqual(
          evidence.access.readPaths?.toSorted() ?? null,
          extraTool ? null : expectedPaths,
        );
        assert.equal(session.close.mock.callCount(), 1);
      }
    }
  }
});
