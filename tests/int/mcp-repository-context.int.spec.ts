/**
 * @file tests/int/mcp-repository-context.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-20
 * @description Проверяет причины Git-only отказов, доступность файлов и отмену context.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Git, GitFailure } from "../../.ai/tools/git-delivery/src/Git.adapter";
import { RepositoryReadError } from "../../services/ai-control-plane/src/RepositoryRead.error";
import { createRepositoryReadPolicy } from "../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { RepositoryCursorService } from "../../services/ai-control-plane/src/RepositoryCursor.service";
import { readMcpRepositoryContext } from "../../services/internal-mcp/src/readMcpRepositoryContext.service";
import type { RepositoryQueryContext } from "../../services/ai-control-plane/src/RepositoryQueries.types";

describe("MCP context: независимые filesystem/Git зависимости", () => {
  let root: string;
  let context: RepositoryQueryContext;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-mcp-health-"));
    context = {
      policy: await createRepositoryReadPolicy(root, true),
      principal: "context-fixture",
      cursors: new RepositoryCursorService(),
    };
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });
  it.each([
    [
      new GitFailure("git_timeout", "bounded timeout", null, "timeout"),
      "TIMEOUT",
    ],
    [new RepositoryReadError("FORBIDDEN", "root mismatch"), "FORBIDDEN"],
  ])("сохраняет причину Git-only ошибки %s", async (error, code) => {
    vi.spyOn(Git.prototype, "run").mockRejectedValue(error);
    expect(await readMcpRepositoryContext(context)).toEqual({
      repository: null,
      modules: [
        { id: "repository", status: "ready", reasonCode: null },
        { id: "git", status: "unavailable", reasonCode: code },
      ],
    });
  });
  it("общая отмена не превращается в успешную диагностику", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readMcpRepositoryContext({ ...context, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("отсутствующий корень отличается от Git-only отказа", async () => {
    await rm(root, { recursive: true, force: true });
    expect(await readMcpRepositoryContext(context)).toMatchObject({
      repository: null,
      modules: [
        { id: "repository", status: "unavailable", reasonCode: "NOT_FOUND" },
        {
          id: "git",
          status: "unavailable",
          reasonCode: "DEPENDENCY_UNAVAILABLE",
        },
      ],
    });
  });
  it("ненастроенный доступ не запускает Git", async () => {
    const run = vi.spyOn(Git.prototype, "run");
    expect(await readMcpRepositoryContext(null)).toEqual({
      repository: null,
      modules: [
        {
          id: "repository",
          status: "not_configured",
          reasonCode: "NOT_CONFIGURED",
        },
        { id: "git", status: "not_configured", reasonCode: "NOT_CONFIGURED" },
      ],
    });
    expect(run).not.toHaveBeenCalled();
  });
});
