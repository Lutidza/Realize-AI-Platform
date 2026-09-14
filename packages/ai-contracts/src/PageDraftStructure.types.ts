/**
 * @file packages/ai-contracts/src/PageDraftStructure.types.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Задаёт одно подтверждаемое изменение размещения Content без произвольного Payload patch.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type {
  DataDocumentRefDTO,
  DataOperationBaseDTO,
} from "./dataOperations";
import type {
  PageDraftCreationResultDTO,
  PageDraftSection,
} from "./PageDraftCreation.types";

/** null означает конец layout; индексы не принимаются как адреса команд. */
export type PageDraftStructureCommand =
  | { type: "insert"; beforeBlockID: string | null; section: PageDraftSection }
  | { type: "move"; blockID: string; beforeBlockID: string | null }
  | { type: "remove"; blockID: string };

/** Ревизия и каталог берутся из серверного чтения именно исходного run. */
export type UpdatePageStructureDraftIntent = {
  version: "1.0";
  kind: "pages.updateStructureDraft.v1";
  pageID: string;
  expectedUpdatedAt: string;
  expectedFingerprint: string;
  expectedCatalogHash: string;
  operation: PageDraftStructureCommand;
};

/** Полный допустимый текст Content; никаких excerpts, HTML, скрытых references или raw Lexical. */
export type PageDraftContentPreviewDTO = {
  blockName?: string;
  columns: Array<{
    size: "oneThird" | "half" | "twoThirds" | "full";
    text: string;
  }>;
};

/** Одна точная перестановка/вставка/удаление; indices отсчитываются от нуля. */
export type PageDraftStructurePreviewDTO = {
  page: DataDocumentRefDTO;
  status: "draft";
  action: "insert" | "move" | "remove";
  blockID: string;
  beforeIndex: number | null;
  afterIndex: number | null;
  totalBefore: number;
  totalAfter: number;
  beforeBlockID: string | null;
  content?: PageDraftContentPreviewDTO;
};

/** Прежний Data Lane lifecycle и отдельное подтверждение отката. */
export type PageDraftStructureOperationDTO = DataOperationBaseDTO & {
  kind: "pages.updateStructureDraft.v1";
  preview: PageDraftStructurePreviewDTO;
  expectedTargetUpdatedAt: string;
  rollbackStrategy: "before-snapshot";
  result?: PageDraftCreationResultDTO;
};
