/**
 * @file .ai/tools/agent-search/src/searchSourceBinding.adapter.mjs
 * @version 1.1.0
 * @date 2026-09-30
 * @description Хеширует явный bounded набор runtime sources без Git, секретов и persistent index.
 */
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
export async function readSearchSourceVersion(root) {
  const paths = [
    ".ai/tools/agent-search/bin/agent-search.mjs",
    "package-lock.json",
    "next.config.ts",
    "scripts/runtime/runProductionBuild.service.mjs",
    "src/app/(app)/api/health/live/route.ts",
    ".ai/tools/agent-search/package-lock.json",
    "packages/ai-contracts/src/mcpToolInputs.config.ts",
    "packages/ai-contracts/src/mcpToolOutputs.config.ts",
    "services/ai-control-plane/src/searchRepository.service.ts",
    "services/ai-control-plane/src/readRepositoryFile.service.ts",
    "services/ai-control-plane/src/readRepositoryLines.service.ts",
    "services/ai-control-plane/src/listRepositoryFiles.service.ts",
    "services/ai-control-plane/src/repositoryReadPolicy.validator.ts",
    "services/ai-control-plane/src/paginateRepositoryResult.service.ts",
    "services/ai-control-plane/src/RepositoryCursor.service.ts",
    "services/ai-control-plane/src/openRepositoryDirectory.adapter.ts",
    "services/ai-control-plane/src/walkRepository.service.ts",
    "services/ai-control-plane/src/mapRepositorySyntaxMatches.mapper.ts",
    "services/ai-control-plane/src/findRepositoryTextMatches.util.ts",
    "services/ai-control-plane/src/resolveRepositoryImports.service.ts",
    "services/ai-control-plane/src/repositoryChatTools.adapter.ts",
    "services/ai-control-plane/src/repositorySourceLink.mapper.ts",
    "services/ai-control-plane/src/buildRepositorySearchObservation.mapper.ts",
    "services/internal-mcp/src/createMcpRegistry.config.ts",
    "services/internal-mcp/src/executeMcpTool.service.ts",
    "services/internal-mcp/src/mcpToolCatalog.config.ts",
    "services/internal-mcp/src/createMcpHttpServer.controller.ts",
    "services/internal-mcp/src/createManagedMcpRuntime.config.ts",
    "services/ai-control-plane/src/createRepositoryMcpBridge.service.ts",
    "services/ai-control-plane/src/createRepositoryRunAccess.service.ts",
    "services/ai-control-plane/src/LocalSearchObservationCollector.service.ts",
    "services/ai-control-plane/src/server.ts",
    "services/ai-execution-worker/src/executor.ts",
    "services/ai-execution-worker/src/independentReviewer.ts",
    "services/ai-execution-worker/src/worker.ts",
    "packages/change-engine/src/repositorySearchPolicy.ts",
    "packages/change-engine/src/executionPolicy.ts",
    "packages/change-engine/src/previewPolicy.ts",
    "packages/codex-adapter/src/OpenAICodexAdapter.ts",
    "packages/codex-adapter/src/closeNativeSearchThreads.service.ts",
    "packages/ai-contracts/src/codexAgentSettings.config.ts",
    "packages/ai-contracts/src/searchObservation.schemas.ts",
    "packages/ai-contracts/src/searchQuality.schemas.ts",
    "packages/payload-ai-plugin/src/search-observability/SearchObservationStore.repository.ts",
    "packages/payload-ai-plugin/src/search-observability/SearchObservationControl.repository.ts",
    "packages/payload-ai-plugin/src/search-observability/SearchQualityStore.repository.ts",
    "packages/payload-ai-plugin/src/search-observability/searchObservationState.schemas.ts",
    "packages/payload-ai-plugin/src/search-observability/retainSearchAggregateHistory.service.ts",
    "packages/payload-ai-plugin/src/integrations/codex/saveCodexAgentSettings.service.ts",
  ];
  // Контракты, потребители и Admin search UI входят в ту же версию; directory set задаёт только owner, не клиент.
  for (const directory of [
    ".ai/tools/agent-search/src",
    "services/ai-control-plane/src",
    "services/ai-execution-worker/src",
    "services/internal-mcp/src",
    "packages/codex-adapter/src",
    "packages/change-engine/src",
    "packages/ai-contracts/src",
    "packages/payload-ai-plugin/src/integrations/codex",
    "packages/payload-ai-plugin/src/runtime",
    "packages/payload-ai-plugin/src/chat-context",
    "packages/payload-ai-plugin/src/search-observability",
    "packages/payload-ai-plugin/src/admin/search-observability",
    "packages/payload-ai-plugin/src/admin/integrations/codex",
  ]) {
    const entries = await readdir(join(root, directory), {
      withFileTypes: true,
    });
    if (entries.length > 512) throw new Error("search_source_binding_limit");
    paths.push(
      ...entries
        .filter((entry) => /\.(?:mjs|ts|tsx|css)$/.test(entry.name))
        .map((entry) => `${directory}/${entry.name}`),
    );
  }
  if (paths.length > 1000) throw new Error("search_source_binding_limit");
  const hash = createHash("sha256");
  let bytes = 0;
  for (const path of [...new Set(paths)].sort()) {
    const full = resolve(root, path);
    const stat = await lstat(full);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (await realpath(full)) !== full ||
      stat.size > 2 * 1024 * 1024 ||
      (bytes += stat.size) > 4 * 1024 * 1024
    )
      throw new Error("search_source_binding_limit");
    hash.update(path);
    hash.update("\0");
    hash.update(await readFile(full));
    hash.update("\0");
  }
  return hash.digest("hex");
}
