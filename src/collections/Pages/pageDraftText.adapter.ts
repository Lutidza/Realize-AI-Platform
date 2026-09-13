/**
 * @file src/collections/Pages/pageDraftText.adapter.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Проецирует разрешённые текстовые листья Pages и меняет их с сохранением структуры документа.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import { parsePageDraftTextChanges } from "@realize/ai-contracts";
import type {
  PageDraftTextChange,
  PageDraftTextFieldDTO,
} from "@realize/ai-contracts";

const LEXICAL_CONTAINERS = new Set([
  "root",
  "paragraph",
  "heading",
  "quote",
  "list",
  "listitem",
  "link",
  "autolink",
  "mark",
]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Host знает схему Pages; переносимый plugin получает только этот явно подключённый адаптер. */
export const pageDraftTextAdapter = {
  version: "1.0" as const,
  readFields(page: Record<string, unknown>): PageDraftTextFieldDTO[] {
    const fields: PageDraftTextFieldDTO[] = [];
    let visited = 0;
    const add = (
      path: string,
      label: string,
      value: unknown,
      maxLength = 4_000,
    ) => {
      if (
        typeof value !== "string" ||
        value.length > maxLength ||
        fields.length >= 128
      ) {
        throw new Error(
          "Текст страницы превышает поддерживаемые границы редактирования.",
        );
      }
      fields.push({ path, label, value, maxLength });
    };
    const richText = (value: unknown, basePath: string, label: string) => {
      if (
        !isRecord(value) ||
        !isRecord(value.root) ||
        value.root.type !== "root"
      )
        return;
      const visit = (value: unknown, path: string, depth: number) => {
        if (++visited > 2_048 || depth > 24) {
          throw new Error(
            "Структура текста страницы слишком велика для ограниченного контекста.",
          );
        }
        if (!isRecord(value)) return;
        if (value.type === "text") {
          add(
            `${path}/text`,
            `${label} · фрагмент ${fields.length + 1}`,
            value.text,
          );
          return;
        }
        // В custom blocks, upload и relationship не заходим: читаем только известные Lexical children.
        if (
          typeof value.type === "string" &&
          LEXICAL_CONTAINERS.has(value.type) &&
          Array.isArray(value.children)
        ) {
          value.children.forEach((child, index) =>
            visit(child, `${path}/children/${index}`, depth + 1),
          );
        }
      };
      visit(value.root, `${basePath}/root`, 0);
    };
    add("/title", "Название страницы", page.title, 160);
    if (page.meta == null || isRecord(page.meta)) {
      const meta = isRecord(page.meta) ? page.meta : {};
      add("/meta/title", "SEO · заголовок", meta.title ?? "", 160);
      add("/meta/description", "SEO · описание", meta.description ?? "", 320);
    }
    if (isRecord(page.hero))
      richText(page.hero.richText, "/hero/richText", "Первый экран");
    if (Array.isArray(page.layout)) {
      if (page.layout.length > 1_024)
        throw new Error("На странице слишком много блоков.");
      page.layout.forEach((block, index) => {
        if (!isRecord(block)) return;
        const path = `/layout/${index}`;
        const label = `Блок ${index + 1}`;
        if (block.blockType === "content" && Array.isArray(block.columns)) {
          if (block.columns.length > 128)
            throw new Error("В блоке слишком много колонок.");
          block.columns.forEach((column, columnIndex) => {
            if (isRecord(column))
              richText(
                column.richText,
                `${path}/columns/${columnIndex}/richText`,
                `${label} · колонка ${columnIndex + 1}`,
              );
          });
        } else if (block.blockType === "cta") {
          richText(
            block.richText,
            `${path}/richText`,
            `${label} · призыв к действию`,
          );
        } else if (block.blockType === "banner") {
          richText(block.content, `${path}/content`, `${label} · баннер`);
        }
      });
    }
    return fields;
  },
  /** Возвращает только изменённые корневые поля; before обязан совпасть с текущей проекцией. */
  patch(
    page: Record<string, unknown>,
    changes: PageDraftTextChange[],
  ): Record<string, unknown> {
    const validated = parsePageDraftTextChanges(changes);
    const fields = new Map(
      pageDraftTextAdapter.readFields(page).map((field) => [field.path, field]),
    );
    const patch: Record<string, unknown> = {};
    for (const change of validated) {
      const field = fields.get(change.path);
      if (
        !field ||
        field.value !== change.before ||
        change.after.length > field.maxLength
      ) {
        throw new Error(
          "Изменение не соответствует текущему разрешённому тексту страницы.",
        );
      }
      const [topLevel, ...segments] = change.path.slice(1).split("/");
      if (!Object.hasOwn(patch, topLevel)) {
        patch[topLevel] =
          page[topLevel] == null && topLevel === "meta"
            ? {}
            : structuredClone(page[topLevel]);
      }
      if (!segments.length) {
        patch[topLevel] = change.after;
        continue;
      }
      let target = patch[topLevel] as Record<string, unknown>;
      for (const segment of segments.slice(0, -1)) {
        target = target[segment] as Record<string, unknown>;
      }
      target[segments[segments.length - 1]] = change.after;
    }
    return patch;
  },
};
