/**
 * @file packages/ai-contracts/src/PageKnowledge.types.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Задаёт описания возможностей и ограниченную структуру выбранной CMS-страницы.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type { DataDocumentRefDTO } from "./dataOperations";

/** Описание из исходников host: сведения об использовании не предоставляют полномочий. */
export type PageArtifactManifest = {
  id: string;
  version: string;
  kind: "collection" | "block";
  title: string;
  description: string;
  schema: { path: string; exportName: string };
  renderer: { path: string; exportName: string };
  guide: { source: string; version: string; instructions: string[] };
  supportedOperations: Array<{ id: string; version: string }>;
};

/** Только выбранные свойства реальной схемы; функции, defaults и admin config не сериализуются. */
export type PageArtifactDefinitionDTO = PageArtifactManifest & {
  fields: Array<{
    path: string;
    type: string;
    required: boolean;
    relationTo?: string[];
  }>;
};

/** Производная проекция host-регистрации и реализованных операций, не реестр разрешений. */
export type PageArtifactCatalogDTO = {
  version: "1.0";
  hash: string;
  definitions: PageArtifactDefinitionDTO[];
};

/** Размещение блока отличается от definition и от записи подключённой формы. */
export type PageBlockOutlineDTO = {
  id: string | null;
  identity: "stable" | "missing" | "duplicate";
  index: number;
  path: string;
  blockType: string;
  definitionID: string | null;
  settings: Array<{ path: string; value: string | number | boolean | null }>;
  references: Array<{
    field: "form";
    collection: "forms";
    id: string | null;
    access: "unresolved" | "readable" | "unavailable";
  }>;
};

/** Порция одной ревизии. Отсутствие блока за пределами порции не означает его удаления. */
export type PageOutlineDTO = {
  offset: number;
  limit: 32;
  totalBlocks: number;
  nextOffset: number | null;
  blocks: PageBlockOutlineDTO[];
};

/** Серверный контекст по запросу: только используемые в порции описания и безопасный outline. */
export type PageKnowledgeDTO = {
  version: "1.0";
  pageID: string;
  fingerprint: string;
  catalogHash: string;
  definitions: PageArtifactDefinitionDTO[];
  outline: PageOutlineDTO;
};

/** Независим от лимита старого текстового контекста; не является разрешением записывать структуру. */
export type PageStructureContextDTO = {
  page: DataDocumentRefDTO;
  updatedAt: string;
  fingerprint: string;
  knowledge: PageKnowledgeDTO;
};
