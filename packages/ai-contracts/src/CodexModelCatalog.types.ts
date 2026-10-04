/**
 * @file packages/ai-contracts/src/CodexModelCatalog.types.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Описывает безопасную проекцию каталога model/list подключённого Codex.
 * @see documentation/architecture/codex-integration.md
 */

export type CodexModelDTO = {
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  multiAgentVersion: "disabled" | "v1" | "v2" | null;
};

/** Каталог не является проверкой entitlement и не содержит выдуманных цен. */
export type CodexModelCatalogDTO = {
  source: "codex-model-list";
  fetchedAt: string;
  revision: number;
  models: CodexModelDTO[];
};
