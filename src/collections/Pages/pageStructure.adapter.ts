/**
 * @file src/collections/Pages/pageStructure.adapter.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Меняет одно размещение Content, сохраняя непрозрачные соседние блоки.
 */
import type { UpdatePageStructureDraftIntent } from "@realize/ai-contracts";
import { mapAIContentBlock } from "@/blocks/Content/mapAIContentBlock.mapper";
import { pageContentPreview } from "@/blocks/Content/pageContentPreview.mapper";
import type { PageStructureInsertionIDs } from "./pageStructure.types";

const validID = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
/** Patch содержит только layout; переносимый сервис независимо проверяет точный эффект. */
export const pageStructureAdapter = {
  version: "1.0",
  previewContent: pageContentPreview,
  patch(
    page: Record<string, unknown>,
    operation: UpdatePageStructureDraftIntent["operation"],
    insertionIDs?: PageStructureInsertionIDs,
  ): Record<string, unknown> {
    if (
      !Array.isArray(page.layout) ||
      (!page.layout.length && operation.type !== "insert") ||
      page.layout.length > 10000
    )
      throw new Error("Структура страницы выходит за границы редактирования.");
    const layout = structuredClone(page.layout) as Record<string, unknown>[];
    const ids = new Set<string>();
    for (const block of layout) {
      if (
        !block ||
        typeof block !== "object" ||
        !validID(block.id) ||
        ids.has(block.id)
      )
        throw new Error("Блоки должны иметь однозначные стабильные IDs.");
      ids.add(block.id);
    }
    const anchor = operation.type === "remove" ? null : operation.beforeBlockID;
    if (anchor !== null && !ids.has(anchor))
      throw new Error("Не найден блок, перед которым нужно поставить Content.");
    if (operation.type === "insert") {
      if (
        !insertionIDs ||
        !validID(insertionIDs.blockID) ||
        !validID(insertionIDs.columnID) ||
        ids.has(insertionIDs.blockID) ||
        layout.length >= 10000
      )
        throw new Error("Невозможно безопасно назначить IDs нового блока.");
      const content = mapAIContentBlock(operation.section);
      const block = {
        ...content,
        id: insertionIDs.blockID,
        blockName: null,
        columns: content.columns.map((column) => ({
          ...column,
          id: insertionIDs.columnID,
          link: {
            type: "reference",
            newTab: null,
            url: null,
            label: null,
            appearance: "default",
          },
        })),
      };
      layout.splice(
        anchor === null
          ? layout.length
          : layout.findIndex((item) => item.id === anchor),
        0,
        block,
      );
    } else {
      const index = layout.findIndex((item) => item.id === operation.blockID);
      if (index < 0 || layout[index].blockType !== "content")
        throw new Error(
          "Менять размещение можно только существующего Content.",
        );
      if (operation.type === "remove") {
        if (layout.length === 1)
          throw new Error("На странице должен остаться хотя бы один блок.");
        pageContentPreview(layout[index]);
        layout.splice(index, 1);
      } else {
        if (anchor === operation.blockID)
          throw new Error("Блок нельзя переместить перед самим собой.");
        const [block] = layout.splice(index, 1);
        const destination =
          anchor === null
            ? layout.length
            : layout.findIndex((item) => item.id === anchor);
        if (destination === index)
          throw new Error("Блок уже находится на выбранном месте.");
        layout.splice(destination, 0, block);
      }
    }
    return { layout };
  },
};
