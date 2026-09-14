/**
 * @file packages/payload-ai-plugin/src/endpoints/PageDraftStructure.types.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Задаёт закрытый адаптер и снимки изменения структуры Pages.
 */
import type {
  PageDraftContentPreviewDTO,
  PageDraftStructurePreviewDTO,
  PageStructureContextDTO,
  UpdatePageStructureDraftIntent,
} from "@realize/ai-contracts";
import type { AppliedPageDraftUpdateSnapshot } from "./PageDraftUpdate.types";
import type { AIDocument } from "./repository";

export type PageDraftInsertionIDs = { blockID: string; columnID: string };
/** Host знает Content; IDs создаёт исполнитель, а модель передаёт только намерение. */
export type PageDraftStructureAdapter = {
  version: string;
  patch: (
    page: Record<string, unknown>,
    operation: UpdatePageStructureDraftIntent["operation"],
    insertionIDs?: PageDraftInsertionIDs,
  ) => Record<string, unknown>;
  previewContent: (
    block: Record<string, unknown>,
  ) => PageDraftContentPreviewDTO;
};
/** Raw layout и документы остаются внутри private Data Lane snapshot. */
export type PageDraftStructureSnapshot = {
  context: PageStructureContextDTO;
  beforePage: AIDocument;
  writeData: Record<string, unknown>;
  expectedPage: AIDocument;
  baseFingerprint: string;
  publicationFingerprint: string;
  adapterVersion: string;
  preview: PageDraftStructurePreviewDTO;
};
export type AppliedPageDraftStructureSnapshot =
  AppliedPageDraftUpdateSnapshot & { catalogHash: string };
