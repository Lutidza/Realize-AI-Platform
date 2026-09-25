/**
 * @file services/internal-mcp/src/listMcpCapabilities.service.ts
 * @version 1.0.1
 * @date 2026-09-24
 * @description Проверяет зависимости доступных регистраций без раскрытия чужих grants и данных.
 * @see documentation/specifications/internal-mcp.md
 */
import type { AiCapabilitiesDto } from "../../../packages/ai-contracts/src/AiInstructions.types";
import type { McpPrincipal, McpRuntimeOptions } from "./McpRuntime.types";
import type { RepositoryCursorService } from "../../ai-control-plane/src/RepositoryCursor.service";
import { hashRepositorySnapshot } from "../../ai-control-plane/src/RepositoryCursor.service";
import { openRepositoryDirectory } from "../../ai-control-plane/src/openRepositoryDirectory.adapter";
import { assertRepositoryReadActive } from "../../ai-control-plane/src/readRepositoryFile.service";
import { probeGitRead } from "../../../.ai/tools/git-delivery/src/read/gitRead.server.index";
import { availableMcpTools } from "./availableMcpTools.service";
import { mcpToolCatalog } from "./mcpToolCatalog.config";

/** Pages ACL проверяется самим вызовом; наличие порта не объявляется доступностью БД. */
export async function listMcpCapabilities(
  principal: McpPrincipal,
  options: McpRuntimeOptions,
  cursors: RepositoryCursorService,
  signal: AbortSignal,
): Promise<AiCapabilitiesDto> {
  const names = availableMcpTools(principal, options);
  let repositoryReady = false;
  let gitReady = false;
  if (
    options.policy &&
    names.some((name) =>
      ["repository", "git"].includes(mcpToolCatalog[name].dependency),
    )
  ) {
    try {
      const directory = await openRepositoryDirectory(options.policy, "");
      try {
        await directory.verify();
        repositoryReady = true;
      } finally {
        await directory.close();
      }
    } catch {
      assertRepositoryReadActive(signal);
    }
    if (
      repositoryReady &&
      names.some((name) => mcpToolCatalog[name].dependency === "git")
    ) {
      try {
        await probeGitRead({
          policy: options.policy,
          principal: principal.principalID,
          cursors,
          signal,
        });
        gitReady = true;
      } catch {
        assertRepositoryReadActive(signal);
      }
    }
  }
  assertRepositoryReadActive(signal);
  const tools: AiCapabilitiesDto["tools"] = names.map((name) => {
    const descriptor = mcpToolCatalog[name];
    const dependency = descriptor.dependency;
    const ready =
      dependency === "none" ||
      (dependency === "repository"
        ? repositoryReady
        : dependency === "git" && gitReady);
    return {
      name,
      ...descriptor,
      effect: "read",
      availability:
        dependency === "pages"
          ? "not_probed"
          : ready
            ? "available"
            : "unavailable",
      reasonCode:
        dependency === "pages"
          ? "CALL_TIME_ACL_REQUIRED"
          : ready
            ? null
            : "DEPENDENCY_UNAVAILABLE",
    };
  });
  return {
    catalogVersion: "1.1",
    snapshotHash: hashRepositorySnapshot(tools),
    observedAt: new Date().toISOString(),
    tools,
  };
}
