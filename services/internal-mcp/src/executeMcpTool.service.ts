/**
 * @file services/internal-mcp/src/executeMcpTool.service.ts
 * @version 1.4.1
 * @date 2026-09-30
 * @description Направляет разрешённые read tools владельцам контекста, репозитория, Git и Pages.
 */
import {
  MCP_WORKSHOP_POLICY,
  type McpWorkshopToolName,
} from "@realize/ai-contracts";
import { randomUUID } from "node:crypto";
import { mcpToolInputs } from "../../../packages/ai-contracts/src/mcpToolInputs.config";
import type { McpToolName } from "../../../packages/ai-contracts/src/McpTool.types";
import { listRepositoryFiles } from "../../ai-control-plane/src/listRepositoryFiles.service";
import { readRepositoryLines } from "../../ai-control-plane/src/readRepositoryLines.service";
import { searchRepository } from "../../ai-control-plane/src/searchRepository.service";
import type { RepositoryCursorService } from "../../ai-control-plane/src/RepositoryCursor.service";
import {
  readGitStatus,
  readGitDiff,
} from "../../../.ai/tools/git-delivery/src/read/gitRead.server.index";
import type { McpPrincipal, McpRuntimeOptions } from "./McpRuntime.types";
import { McpError } from "./Mcp.error";
import { mcpErrorCodes } from "../../../packages/ai-contracts/src/mcpToolOutputs.config";
import { availableMcpTools } from "./availableMcpTools.service";
import { listMcpCapabilities } from "./listMcpCapabilities.service";
import { resolveAiContext } from "../../ai-control-plane/src/resolveAiContext.service";
import { readAiInstructions } from "../../ai-control-plane/src/readAiInstructions.service";
import type { RepositorySearchMetrics } from "../../ai-control-plane/src/RepositoryQueries.types";
import { buildRepositorySourceLink } from "../../ai-control-plane/src/repositorySourceLink.mapper";
import { MCP_SERVER_VERSION } from "./mcpToolCatalog.config";

export async function executeMcpTool(
  name: McpToolName,
  input: unknown,
  principal: McpPrincipal,
  options: McpRuntimeOptions,
  cursors: RepositoryCursorService,
  signal: AbortSignal,
  searchMetrics?: RepositorySearchMetrics,
): Promise<unknown> {
  if (
    principal.discoveryOnly ||
    !availableMcpTools(principal, options).includes(name)
  )
    throw new McpError(
      "FORBIDDEN",
      "Инструмент не разрешён текущему principal.",
    );
  if (options.repositoryTools) {
    const result = (await options.repositoryTools.execute({
      name,
      arguments: input,
      callID: randomUUID(),
    })) as {
      ok: boolean;
      data?: unknown;
      error?: { code: string; message: string };
    };
    if (!result.ok) {
      const code =
        mcpErrorCodes.find((code) => code === result.error?.code) ??
        "DEPENDENCY_UNAVAILABLE";
      throw new McpError(code, result.error?.message ?? "Чтение недоступно.");
    }
    return result.data;
  }
  const context = options.policy
    ? {
        policy: options.policy,
        principal: principal.principalID,
        cursors,
        signal,
        responseBytes: [
          "repo_search",
          "repo_read_file",
          "repo_list_files",
        ].includes(name)
          ? // Reader резервирует собственные 4096 bytes; wire содержит structured JSON и его escaped text копию.
            4096 + Math.floor((principal.limits.responseBytes - 4096) / 3)
          : principal.limits.responseBytes,
        searchMetrics,
      }
    : null;
  if (name === "realize_get_context") {
    let repository = null;
    let repositoryStatus: "ready" | "not_configured" | "unavailable" =
      principal.repositoryRead && context ? "ready" : "not_configured";
    if (principal.repositoryRead && context) {
      try {
        // Context должен оставаться доступным при дорогом полном Git snapshot.
        const status = await readGitStatus(
          {
            ...context,
            signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]),
          },
          { limit: 1 },
        );
        repository = {
          branch: status.branch,
          head: status.head,
          dirty: status.entries.length > 0,
          dirtyScope: "allowed_paths" as const,
        };
      } catch {
        repositoryStatus = "unavailable";
      }
    }
    return {
      project: { name: "Realize — AI CMS", version: "1.0.0" },
      server: {
        name: "realize-internal-mcp",
        version: MCP_SERVER_VERSION,
        ...(options.sourceVersion
          ? { sourceVersion: options.sourceVersion }
          : {}),
        ...(options.installedBuildID
          ? { installedBuildID: options.installedBuildID }
          : {}),
        protocolVersions: ["2026-07-28", "2025-11-25"],
      },
      principal: {
        id: principal.principalID,
        scopes: [
          ...(principal.repositoryRead ? ["repository:read"] : []),
          ...(principal.pagesRead ? ["pages:read"] : []),
          ...(principal.workshopRead ? ["workshop:read"] : []),
          ...(principal.workshopWrite ? ["workshop:write"] : []),
          ...(principal.workshopPreview ? ["workshop:preview"] : []),
        ],
      },
      installation: { mode: "single", id: principal.installationID },
      modules: [
        {
          id: "repository",
          status: repositoryStatus,
          reasonCode:
            repositoryStatus === "ready"
              ? null
              : repositoryStatus === "unavailable"
                ? "DEPENDENCY_UNAVAILABLE"
                : "NOT_CONFIGURED",
        },
        {
          id: "pages",
          status:
            principal.pagesRead && options.pages ? "ready" : "not_configured",
          reasonCode:
            principal.pagesRead && options.pages ? null : "NOT_CONFIGURED",
        },
        {
          id: "workshop",
          status:
            principal.workshopRead && options.workshop
              ? "ready"
              : "not_configured",
          reasonCode:
            principal.workshopRead && options.workshop
              ? null
              : "NOT_CONFIGURED",
        },
      ],
      tools: availableMcpTools(principal, options).map((tool) => ({
        name: tool,
        inputSchemaVersion: "1.0",
        outputSchemaVersion: "1.0",
      })),
      repository,
    };
  }
  if (name in MCP_WORKSHOP_POLICY) {
    if (!options.workshop)
      throw new McpError("DEPENDENCY_UNAVAILABLE", "Мастерская недоступна.");
    return options.workshop.execute(
      principal,
      name as McpWorkshopToolName,
      input,
      signal,
    );
  }
  if (name === "ai_capabilities_list")
    return listMcpCapabilities(principal, options, cursors, signal);
  if (
    name === "pages_list" ||
    name === "pages_get" ||
    name === "pages_get_structure"
  ) {
    if (!options.pages)
      throw new McpError(
        "DEPENDENCY_UNAVAILABLE",
        "Чтение Pages не настроено.",
      );
    return options.pages.execute(
      principal,
      name,
      mcpToolInputs[name].parse(input),
      signal,
    );
  }
  if (!context)
    throw new McpError(
      "DEPENDENCY_UNAVAILABLE",
      "Чтение репозитория не настроено.",
    );
  switch (name) {
    case "ai_context_resolve":
      return resolveAiContext(
        context,
        mcpToolInputs.ai_context_resolve.parse(input),
      );
    case "ai_instructions_get":
      return readAiInstructions(
        context,
        mcpToolInputs.ai_instructions_get.parse(input),
      );
    case "repo_list_files":
      return listRepositoryFiles(
        context,
        mcpToolInputs.repo_list_files.parse(input),
      );
    case "repo_read_file": {
      const data = await readRepositoryLines(
        context,
        mcpToolInputs.repo_read_file.parse(input),
      );
      return options.repositorySourceURLBase
        ? {
            ...data,
            sourceUrl: buildRepositorySourceLink(
              data.path,
              data.startLine,
              data.version.sha256,
              options.repositorySourceURLBase,
            ),
          }
        : data;
    }
    case "repo_search": {
      const data = await searchRepository(
        context,
        mcpToolInputs.repo_search.parse(input),
      );
      return options.repositorySourceURLBase
        ? {
            ...data,
            matches: data.matches.map((match) => ({
              ...match,
              sourceUrl: buildRepositorySourceLink(
                match.path,
                match.line,
                match.fileSha256,
                options.repositorySourceURLBase,
              ),
            })),
          }
        : data;
    }
    case "repo_git_status":
      return readGitStatus(context, mcpToolInputs.repo_git_status.parse(input));
    case "repo_git_diff":
      return readGitDiff(context, mcpToolInputs.repo_git_diff.parse(input));
  }
  throw new McpError("INVALID_INPUT", "Неизвестный инструмент.");
}
