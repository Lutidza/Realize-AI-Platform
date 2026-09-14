/**
 * @file src/blocks/Content/pageContentPreview.mapper.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Полностью проецирует удаляемый текстовый Content и отклоняет скрытые зависимости.
 */
import {
  parsePageDraftContentPreview,
  type PageDraftContentPreviewDTO,
} from "@realize/ai-contracts";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
function fail(): never {
  throw new Error(
    "Блок содержит неподдерживаемые данные. Удалите его через обычный редактор Payload.",
  );
}
const keys = (value: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail();
};

/** Ничего не обрезает: превью должно представлять всё удаляемое содержимое. */
export const pageContentPreview = (
  block: Record<string, unknown>,
): PageDraftContentPreviewDTO => {
  keys(block, ["id", "blockType", "blockName", "columns"]);
  if (
    block.blockType !== "content" ||
    !Array.isArray(block.columns) ||
    !block.columns.length ||
    block.columns.length > 16
  )
    fail();
  if (
    block.blockName != null &&
    (typeof block.blockName !== "string" || block.blockName.length > 160)
  )
    fail();
  let visited = 0;
  const text = (value: unknown, depth: number, expected?: string): string => {
    if (
      ++visited > 2048 ||
      depth > 24 ||
      !record(value) ||
      (expected && value.type !== expected)
    )
      fail();
    if (
      (value.style != null && value.style !== "") ||
      (value.textStyle != null && value.textStyle !== "")
    )
      fail();
    if (value.type === "text") {
      keys(value, [
        "type",
        "version",
        "detail",
        "format",
        "mode",
        "style",
        "text",
      ]);
      if (
        typeof value.text !== "string" ||
        value.text.length > 16000 ||
        ![undefined, "normal"].includes(value.mode as string | undefined)
      )
        fail();
      return value.text as string;
    }
    if (value.type === "linebreak") {
      keys(value, ["type", "version"]);
      return "\n";
    }
    if (
      !["root", "paragraph", "heading"].includes(String(value.type)) ||
      !Array.isArray(value.children)
    )
      fail();
    keys(value, [
      "type",
      "version",
      "children",
      "direction",
      "format",
      "indent",
      "textFormat",
      "textStyle",
      ...(value.type === "heading" ? ["tag"] : []),
    ]);
    const children = value.children as unknown[];
    if (
      children.some(
        (child) =>
          !record(child) ||
          (value.type === "root"
            ? !["paragraph", "heading"].includes(String(child.type))
            : !["text", "linebreak"].includes(String(child.type))),
      )
    )
      fail();
    const result = children
      .map((child) => text(child, depth + 1))
      .join(value.type === "root" ? "\n" : "");
    if (result.length > 16000) fail();
    return result;
  };
  const columns = (block.columns as unknown[]).map((column) => {
    if (!record(column)) fail();
    keys(column, ["id", "size", "enableLink", "link", "richText"]);
    if (column.enableLink != null && column.enableLink !== false) fail();
    if (column.link != null) {
      if (!record(column.link)) fail();
      keys(column.link, [
        "type",
        "newTab",
        "reference",
        "url",
        "label",
        "appearance",
      ]);
      const link = column.link as Record<string, unknown>;
      if (
        ![undefined, null, "reference"].includes(
          link.type as string | null | undefined,
        ) ||
        ![undefined, null, "default"].includes(
          link.appearance as string | null | undefined,
        ) ||
        (link.newTab != null && link.newTab !== false) ||
        [link.reference, link.url, link.label].some(
          (value) => value != null && value !== "",
        )
      )
        fail();
    }
    if (!record(column.richText)) fail();
    keys(column.richText, ["root"]);
    return { size: column.size, text: text(column.richText.root, 0, "root") };
  });
  return parsePageDraftContentPreview({
    columns,
    ...(typeof block.blockName === "string" && block.blockName.length
      ? { blockName: block.blockName }
      : {}),
  });
};
