// @vitest-environment node
/**
 * @file tests/int/pageStructureHost.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет размещения Content, полный preview удаления и независимые инварианты patch.
 */
import { describe, expect, it } from "vitest";
import { pageStructureAdapter } from "../../src/collections/Pages/pageStructure.adapter";
import { pageContentPreview } from "../../src/blocks/Content/pageContentPreview.mapper";
import { mapAIContentBlock } from "../../src/blocks/Content/mapAIContentBlock.mapper";
import { validatePageDraftStructurePatch } from "../../packages/payload-ai-plugin/src/endpoints/validatePageDraftStructurePatch.validator";

const ids = { blockID: "inserted", columnID: "inserted-column" };
const fixture = () => ({
  id: 7,
  _status: "published",
  hero: { type: "none" },
  layout: [
    {
      id: "text",
      ...mapAIContentBlock({
        heading: "Заголовок",
        body: "Абзац один.\nАбзац два.",
      }),
    },
    {
      id: "form",
      blockType: "formBlock",
      form: 91,
      introContent: { secret: "не входит в preview" },
    },
    { id: "media", blockType: "mediaBlock", media: 45 },
  ],
});

describe("Структурный host adapter Content", () => {
  it("добавляет первый Content в пустую страницу с сохраняемыми Payload значениями ссылки", () => {
    const page = { ...fixture(), layout: [] };
    const operation = {
      type: "insert" as const,
      beforeBlockID: null,
      section: { body: "Первый блок." },
    };
    const expected = validatePageDraftStructurePatch(
      page,
      pageStructureAdapter.patch(page, operation, ids),
      operation,
      ids,
    );
    const layout = expected.layout as Array<{
      id: string;
      columns: Array<{ link: Record<string, unknown> }>;
    }>;
    expect(page.layout).toEqual([]);
    expect(layout).toHaveLength(1);
    expect(layout[0].id).toBe(ids.blockID);
    expect(layout[0].columns[0].link).not.toHaveProperty("reference");
    expect(pageContentPreview(layout[0])).toEqual({
      columns: [{ size: "full", text: "Первый блок." }],
    });
  });

  it("вставляет plain-text Content перед формой, сохраняя исходную страницу и все соседние поля", () => {
    const page = fixture();
    const original = structuredClone(page);
    const operation = {
      type: "insert" as const,
      beforeBlockID: "form",
      section: { heading: "Доставка", body: "Первый абзац.\nВторой." },
    };
    const patch = pageStructureAdapter.patch(page, operation, ids);
    const expected = validatePageDraftStructurePatch(
      page,
      patch,
      operation,
      ids,
    );
    expect(page).toEqual(original);
    expect(
      (expected.layout as Array<Record<string, unknown>>).map((b) => b.id),
    ).toEqual(["text", "inserted", "form", "media"]);
    expect((expected.layout as unknown[]).slice(2)).toEqual(
      original.layout.slice(1),
    );
    expect(expected.hero).toEqual(original.hero);
    expect(
      pageContentPreview((expected.layout as Record<string, unknown>[])[1]),
    ).toEqual({
      columns: [{ size: "full", text: "Доставка\nПервый абзац.\nВторой." }],
    });
  });

  it("перемещает непрозрачный Content со ссылками без изменения его значений", () => {
    const page = fixture();
    Object.assign(page.layout[0], { extraConfiguration: { future: true } });
    const operation = {
      type: "move" as const,
      blockID: "text",
      beforeBlockID: null,
    };
    const patch = pageStructureAdapter.patch(page, operation);
    const expected = validatePageDraftStructurePatch(page, patch, operation);
    expect((expected.layout as unknown[])[2]).toEqual(page.layout[0]);
    expect((expected.layout as unknown[]).slice(0, 2)).toEqual(
      page.layout.slice(1),
    );
  });

  it("удаляет только выбранный Content и полностью показывает его текст", () => {
    const page = fixture();
    const operation = { type: "remove" as const, blockID: "text" };
    const preview = pageContentPreview(page.layout[0]);
    expect(preview.columns[0].text).toBe("Заголовок\nАбзац один.\nАбзац два.");
    expect(
      validatePageDraftStructurePatch(
        page,
        pageStructureAdapter.patch(page, operation),
        operation,
      ).layout,
    ).toEqual(page.layout.slice(1));
  });

  it("сохраняет полное имя удаляемого Content в preview", () => {
    const block = {
      id: "named",
      blockName: "Доставка курьером",
      ...mapAIContentBlock({ body: "Привезём завтра." }),
    };
    expect(pageContentPreview(block)).toEqual({
      blockName: "Доставка курьером",
      columns: [{ size: "full", text: "Привезём завтра." }],
    });
    expect(() =>
      pageContentPreview({ ...block, blockName: "x".repeat(161) }),
    ).toThrow();
  });

  it.each(["style", "textStyle"])(
    "не скрывает потерю CSS при удалении: %s",
    (field) => {
      const block = { id: "styled", ...mapAIContentBlock({ body: "Текст." }) };
      const root = block.columns[0].richText.root as unknown as Record<
        string,
        unknown
      >;
      root[field] = "display: none";
      expect(() => pageContentPreview(block)).toThrow();
    },
  );

  it.each([
    "enabled-link",
    "hidden-link",
    "custom-node",
    "custom-column",
    "custom-block",
    "truncation",
  ])(
    "не удаляет содержимое, которое невозможно полностью показать: %s",
    (reason) => {
      const block = {
        id: "text",
        ...mapAIContentBlock({ body: "Текст." }),
      } as Record<string, unknown>;
      const column = (block.columns as Record<string, unknown>[])[0];
      if (reason === "enabled-link") column.enableLink = true;
      if (reason === "hidden-link")
        column.link = { url: "https://example.com" };
      if (reason === "custom-node")
        (
          column.richText as { root: { children: unknown[] } }
        ).root.children.push({ type: "upload", value: 12 });
      if (reason === "custom-column") column.hidden = true;
      if (reason === "custom-block") block.hidden = true;
      if (reason === "truncation")
        Object.assign(block, mapAIContentBlock({ body: "x".repeat(16001) }));
      expect(() => pageContentPreview(block)).toThrow();
      expect(() =>
        pageStructureAdapter.patch(
          { layout: [block, fixture().layout[1]] },
          { type: "remove", blockID: "text" },
        ),
      ).toThrow();
    },
  );

  it.each([
    "missing",
    "duplicate",
    "wrong-target",
    "last",
    "same-place",
    "self-anchor",
  ])("отклоняет неоднозначное или пустое изменение: %s", (reason) => {
    const page = fixture();
    if (reason === "missing")
      delete (page.layout[1] as Record<string, unknown>).id;
    if (reason === "duplicate") page.layout[1].id = "text";
    if (reason === "last") page.layout.splice(1);
    const operation =
      reason === "same-place" || reason === "self-anchor"
        ? {
            type: "move" as const,
            blockID: "text",
            beforeBlockID: reason === "same-place" ? "form" : "text",
          }
        : {
            type: "remove" as const,
            blockID: reason === "wrong-target" ? "form" : "text",
          };
    expect(() => pageStructureAdapter.patch(page, operation)).toThrow();
  });

  it.each([
    "other-root",
    "other-block",
    "invented-id",
    "insert-text",
    "insert-link",
  ])(
    "независимая проверка не принимает расширенный host patch: %s",
    (reason) => {
      const page = fixture();
      const operation = {
        type: "insert" as const,
        beforeBlockID: null,
        section: { body: "Новый текст." },
      };
      const patch = pageStructureAdapter.patch(page, operation, ids);
      const layout = patch.layout as Record<string, unknown>[];
      const column = (layout[3].columns as Record<string, unknown>[])[0];
      if (reason === "other-root") patch.hero = { type: "none" };
      if (reason === "other-block") layout[1].form = 999;
      if (reason === "invented-id") layout[3].id = "model-id";
      if (reason === "insert-text")
        column.richText = mapAIContentBlock({
          body: "Подмена",
        }).columns[0].richText;
      if (reason === "insert-link") column.link = { url: "/other-page" };
      expect(() =>
        validatePageDraftStructurePatch(page, patch, operation, ids),
      ).toThrow();
    },
  );
});
