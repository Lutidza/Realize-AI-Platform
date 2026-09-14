/**
 * @file src/collections/Pages/pageKnowledgeOutline.mapper.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проецирует одну порцию layout с исходными идентичностями и минимальными ссылками.
 */
import type {
  PageBlockOutlineDTO,
  PageOutlineDTO,
} from "@realize/ai-contracts";
import { ContractValidationError } from "@realize/ai-contracts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = (value: unknown): string | null => {
  const candidate =
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : value;
  return typeof candidate === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(candidate)
    ? candidate
    : null;
};

/** Не извлекает richText и raw forms; совпадения IDs проверяются по всему bounded layout. */
export const pageKnowledgeOutline = (
  page: Record<string, unknown>,
  offset: number,
): PageOutlineDTO => {
  const layout = page.layout == null ? [] : page.layout;
  if (!Array.isArray(layout) || layout.length > 10_000)
    throw new ContractValidationError(
      "Структура страницы превышает границы чтения.",
    );
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    (offset > 0 && offset >= layout.length) ||
    offset % 32 !== 0
  )
    throw new ContractValidationError(
      "Некорректная порция структуры страницы.",
    );
  const ids = new Map<string, number>();
  for (const block of layout) {
    const id = isRecord(block) ? identifier(block.id) : null;
    if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  const blocks = layout
    .slice(offset, offset + 32)
    .map((block, localIndex): PageBlockOutlineDTO => {
      if (
        !isRecord(block) ||
        typeof block.blockType !== "string" ||
        !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(block.blockType)
      )
        throw new ContractValidationError("Некорректный тип блока страницы.");
      const id = identifier(block.id);
      const index = offset + localIndex;
      const settings: PageBlockOutlineDTO["settings"] = [];
      const references: PageBlockOutlineDTO["references"] = [];
      if (block.blockType === "content") {
        if (Array.isArray(block.columns) && block.columns.length > 10_000)
          throw new ContractValidationError(
            "Число колонок превышает границы чтения.",
          );
        settings.push({
          path: "/columns/count",
          value: Array.isArray(block.columns) ? block.columns.length : 0,
        });
      } else if (block.blockType === "formBlock") {
        settings.push({
          path: "/enableIntro",
          value: block.enableIntro === true,
        });
        settings.push({
          path: "/introContent/present",
          value: block.introContent != null,
        });
        const formID = identifier(
          isRecord(block.form) ? block.form.id : block.form,
        );
        references.push({
          field: "form",
          collection: "forms",
          id: formID,
          access: "unresolved",
        });
      }
      return {
        id,
        identity:
          id === null
            ? "missing"
            : (ids.get(id) ?? 0) > 1
              ? "duplicate"
              : "stable",
        index,
        path: `/layout/${index}`,
        blockType: block.blockType,
        definitionID:
          block.blockType === "content"
            ? "blocks.content"
            : block.blockType === "formBlock"
              ? "blocks.formBlock"
              : null,
        settings,
        references,
      };
    });
  return {
    offset,
    limit: 32,
    totalBlocks: layout.length,
    nextOffset: offset + 32 < layout.length ? offset + 32 : null,
    blocks,
  };
};
