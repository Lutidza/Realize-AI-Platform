/**
 * @file packages/payload-ai-plugin/src/endpoints/validatePageDraftStructurePatch.validator.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Независимо от host проверяет точный эффект одного структурного изменения.
 */
import type { UpdatePageStructureDraftIntent } from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { PageDraftInsertionIDs } from "./PageDraftStructure.types";
import type { AIDocument } from "./repository";
import { EndpointError } from "./http";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
function fail(): never {
  throw new EndpointError(
    "CONFLICT",
    "Адаптер изменил данные вне подтверждённой структуры Content.",
    409,
  );
}
const equal = (left: unknown, right: unknown): boolean =>
  hashCanonicalJSON(left) === hashCanonicalJSON(right);
const keys = (value: Record<string, unknown>, allowed: string[]) => {
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    allowed.some((key) => !Object.hasOwn(value, key))
  )
    fail();
};

/** Проверяет синтаксис канонического Lexical, а не доверяет содержимому host mapper. */
const validateInserted = (
  block: unknown,
  section: Extract<
    UpdatePageStructureDraftIntent["operation"],
    { type: "insert" }
  >["section"],
  ids: PageDraftInsertionIDs,
) => {
  if (!record(block)) fail();
  keys(block, ["id", "blockType", "blockName", "columns"]);
  if (
    block.id !== ids.blockID ||
    block.blockType !== "content" ||
    block.blockName !== null ||
    !Array.isArray(block.columns) ||
    block.columns.length !== 1
  )
    fail();
  const column = (block.columns as unknown[])[0];
  if (!record(column)) fail();
  keys(column, ["id", "size", "enableLink", "link", "richText"]);
  if (
    column.id !== ids.columnID ||
    column.size !== "full" ||
    column.enableLink !== false ||
    !equal(column.link, {
      type: "reference",
      newTab: null,
      url: null,
      label: null,
      appearance: "default",
    }) ||
    !record(column.richText)
  )
    fail();
  const richText = column.richText as Record<string, unknown>;
  keys(richText, ["root"]);
  const root = richText.root;
  if (!record(root)) fail();
  keys(root, ["children", "direction", "format", "indent", "type", "version"]);
  if (
    root.type !== "root" ||
    root.version !== 1 ||
    root.direction !== "ltr" ||
    root.format !== "" ||
    root.indent !== 0 ||
    !Array.isArray(root.children)
  )
    fail();
  const texts = [
    ...(section.heading ? [section.heading] : []),
    ...section.body.split("\n"),
  ];
  if ((root.children as unknown[]).length !== texts.length) fail();
  (root.children as unknown[]).forEach((node, index) => {
    if (!record(node)) fail();
    const heading = Boolean(section.heading) && index === 0;
    keys(node, [
      "children",
      "direction",
      "format",
      "indent",
      "type",
      "version",
      ...(heading ? ["tag"] : ["textFormat", "textStyle"]),
    ]);
    if (
      node.type !== (heading ? "heading" : "paragraph") ||
      node.version !== 1 ||
      node.direction !== "ltr" ||
      node.format !== "" ||
      node.indent !== 0 ||
      (heading
        ? node.tag !== "h2"
        : node.textFormat !== 0 || node.textStyle !== "") ||
      !equal(node.children, [
        {
          detail: 0,
          format: 0,
          mode: "normal",
          style: "",
          text: texts[index],
          type: "text",
          version: 1,
        },
      ])
    )
      fail();
  });
};

/** Возвращает ожидаемый документ, сохраняя все поля вне layout и будущий статус draft. */
export const validatePageDraftStructurePatch = (
  page: AIDocument,
  patch: Record<string, unknown>,
  operation: UpdatePageStructureDraftIntent["operation"],
  insertionIDs?: PageDraftInsertionIDs,
): AIDocument => {
  if (!record(patch)) fail();
  keys(patch, ["layout"]);
  if (
    !Array.isArray(page.layout) ||
    (!page.layout.length && operation.type !== "insert") ||
    page.layout.length > 10000 ||
    !Array.isArray(patch.layout) ||
    !patch.layout.length ||
    patch.layout.length > 10000
  )
    fail();
  const before = page.layout as unknown[];
  const ids = new Set<string>();
  for (const block of before) {
    if (
      !record(block) ||
      typeof block.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(block.id) ||
      ids.has(block.id)
    )
      fail();
    ids.add(block.id as string);
  }
  const expected = structuredClone(before) as Record<string, unknown>[];
  const anchor = operation.type === "remove" ? null : operation.beforeBlockID;
  if (anchor !== null && !ids.has(anchor)) fail();
  if (operation.type === "insert") {
    if (!insertionIDs || ids.has(insertionIDs.blockID)) fail();
    const index =
      anchor === null
        ? expected.length
        : expected.findIndex((block) => block.id === anchor);
    const inserted = (patch.layout as unknown[])[index];
    validateInserted(inserted, operation.section, insertionIDs!);
    expected.splice(index, 0, inserted as Record<string, unknown>);
  } else {
    const index = expected.findIndex((block) => block.id === operation.blockID);
    if (index < 0 || expected[index].blockType !== "content") fail();
    const [block] = expected.splice(index, 1);
    if (operation.type === "move") {
      if (anchor === operation.blockID) fail();
      const destination =
        anchor === null
          ? expected.length
          : expected.findIndex((block) => block.id === anchor);
      if (destination === index) fail();
      expected.splice(destination, 0, block);
    }
  }
  if (!equal(expected, patch.layout)) fail();
  return {
    ...structuredClone(page),
    layout: structuredClone(patch.layout),
    _status: "draft",
  };
};
