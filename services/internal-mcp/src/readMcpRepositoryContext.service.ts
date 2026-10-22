/**
 * @file services/internal-mcp/src/readMcpRepositoryContext.service.ts
 * @version 1.0.0
 * @date 2026-10-20
 * @description Независимо проверяет доступность файлов и Git без полного снимка checkout.
 * @see documentation/specifications/internal-mcp.md
 */
import { readGitHead } from "../../../.ai/tools/git-delivery/src/read/gitRead.server.index";
import { GitFailure } from "../../../.ai/tools/git-delivery/src/GitFailure.error";
import { openRepositoryDirectory } from "../../ai-control-plane/src/openRepositoryDirectory.adapter";
import { assertRepositoryReadActive } from "../../ai-control-plane/src/readRepositoryFile.service";
import { RepositoryReadError } from "../../ai-control-plane/src/RepositoryRead.error";
import type { RepositoryQueryContext } from "../../ai-control-plane/src/RepositoryQueries.types";
import type { McpRepositoryContext } from "./McpRepositoryContext.types";

/** Git-only отказ не закрывает доступ к файлам; null dirty означает отсутствие проверки. */
export async function readMcpRepositoryContext(
  context: RepositoryQueryContext | null,
): Promise<McpRepositoryContext> {
  const modules: McpRepositoryContext["modules"] = [
    {
      id: "repository",
      status: "not_configured",
      reasonCode: "NOT_CONFIGURED",
    },
    { id: "git", status: "not_configured", reasonCode: "NOT_CONFIGURED" },
  ];
  if (!context) return { repository: null, modules };
  const reason = (error: unknown) =>
    error instanceof RepositoryReadError
      ? error.code
      : error instanceof GitFailure && error.category === "timeout"
        ? "TIMEOUT"
        : "DEPENDENCY_UNAVAILABLE";
  try {
    assertRepositoryReadActive(context.signal);
    const directory = await openRepositoryDirectory(context.policy, "");
    try {
      await directory.verify();
      assertRepositoryReadActive(context.signal);
    } finally {
      await directory.close();
    }
    modules[0] = { id: "repository", status: "ready", reasonCode: null };
  } catch (error) {
    assertRepositoryReadActive(context.signal);
    modules[0] = {
      id: "repository",
      status: "unavailable",
      reasonCode: reason(error),
    };
    modules[1] = {
      id: "git",
      status: "unavailable",
      reasonCode: "DEPENDENCY_UNAVAILABLE",
    };
    return { repository: null, modules };
  }
  try {
    const { head, branch } = await readGitHead({
      ...context,
      signal: AbortSignal.any([
        ...(context.signal ? [context.signal] : []),
        AbortSignal.timeout(2000),
      ]),
    });
    assertRepositoryReadActive(context.signal);
    modules[1] = { id: "git", status: "ready", reasonCode: null };
    return {
      modules,
      repository: {
        head,
        branch,
        dirty: null,
        dirtyStatus: "not_checked",
        dirtyScope: "allowed_paths",
      },
    };
  } catch (error) {
    // Общая отмена завершает RPC; локальный Git deadline остаётся точной причиной диагностики.
    assertRepositoryReadActive(context.signal);
    modules[1] = {
      id: "git",
      status: "unavailable",
      reasonCode: reason(error),
    };
    return { repository: null, modules };
  }
}
