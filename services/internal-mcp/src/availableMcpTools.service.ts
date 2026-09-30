/**
 * @file services/internal-mcp/src/availableMcpTools.service.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Пересекает существующие регистрации с текущим principal и доверенной конфигурацией.
 */
import type { McpToolName } from "../../../packages/ai-contracts/src/McpTool.types";
import type { McpPrincipal, McpRuntimeOptions } from "./McpRuntime.types";
import { mcpToolCatalog } from "./mcpToolCatalog.config";

/** Временный outage не удаляет разрешённую регистрацию; её call вернёт ошибку зависимости. */
export function availableMcpTools(
  principal: McpPrincipal,
  options: McpRuntimeOptions,
): McpToolName[] {
  return [
    "realize_get_context",
    ...principal.allowedTools.filter((name) => {
      if (name === "realize_get_context") return false;
      const entry = mcpToolCatalog[name];
      if (!entry) return false;
      if (entry.grant === "context") return true;
      if (entry.dependency === "workshop")
        return (
          !!options.workshop &&
          principal.workshopRead === true &&
          (entry.grant === "workshop:read" ||
            (entry.grant === "workshop:write"
              ? principal.workshopWrite === true
              : principal.workshopPreview === true))
        );
      if (entry.grant === "pages:read")
        return principal.pagesRead && !!options.pages;
      if (!principal.repositoryRead || !options.policy) return false;
      return (
        entry.grant !== "instructions:read" ||
        options.policy.developerInstructions
      );
    }),
  ];
}
