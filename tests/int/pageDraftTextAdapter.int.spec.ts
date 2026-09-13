// @vitest-environment node
/**
 * @file tests/int/pageDraftTextAdapter.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Проверяет сохранение Payload/Lexical структуры при изменении только разрешённых текстовых листьев.
 */
import { describe, expect, it } from "vitest";
import { pageDraftTextAdapter } from "../../src/collections/Pages/pageDraftText.adapter";

const richText = (text: string) => ({
  root: {
    type: "root",
    version: 1,
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "link",
            fields: {
              url: "/unchanged",
              doc: { relationTo: "pages", value: 7 },
            },
            children: [
              {
                type: "text",
                text,
                format: 3,
                style: "color: red",
                mode: "normal",
                detail: 0,
                version: 1,
              },
            ],
          },
        ],
      },
    ],
  },
});
const fixture = () => ({
  id: 17,
  title: "О компании",
  slug: "about",
  _status: "published",
  updatedAt: "2026-09-12T10:00:00.000Z",
  publishedOn: "2026-09-01T10:00:00.000Z",
  meta: {
    title: "SEO",
    description: "Описание",
    image: 31,
    custom: { preserved: true },
  },
  hero: {
    type: "highImpact",
    media: 30,
    richText: richText(" Первый экран "),
    links: [{ id: "hero-link", link: { url: "/hero" } }],
  },
  layout: [
    {
      id: "content-id",
      blockType: "content",
      columns: [
        {
          id: "column-id",
          size: "half",
          enableLink: true,
          link: { url: "/content", doc: 7 },
          richText: richText("Текст колонки"),
        },
      ],
    },
    {
      id: "cta-id",
      blockType: "cta",
      richText: richText("Призыв"),
      links: [{ id: "cta-link", link: { url: "/cta" } }],
    },
    {
      id: "banner-id",
      blockType: "banner",
      style: "warning",
      content: richText("Внимание"),
    },
    { id: "media-id", blockType: "mediaBlock", media: 77 },
    {
      id: "form-id",
      blockType: "formBlock",
      form: 9,
      richText: richText("Закрытый текст формы"),
    },
  ],
});

describe("Текстовый host adapter Pages", () => {
  it("проецирует title, SEO, hero, Content, CTA и Banner без media/forms/relationships", () => {
    const fields = pageDraftTextAdapter.readFields(fixture());
    expect(fields.map((field) => field.value)).toEqual([
      "О компании",
      "SEO",
      "Описание",
      " Первый экран ",
      "Текст колонки",
      "Призыв",
      "Внимание",
    ]);
    expect(
      fields.every(
        (field) =>
          Object.keys(field).sort().join(",") === "label,maxLength,path,value",
      ),
    ).toBe(true);
    expect(fields.map((field) => field.path)).not.toContain("/slug");
    expect(JSON.stringify(fields)).not.toContain("/unchanged");
  });
  it("сохраняет всю сложную структуру и исходный документ при точном diff нескольких поддеревьев", () => {
    const page = fixture();
    const original = structuredClone(page);
    const changes = pageDraftTextAdapter
      .readFields(page)
      .filter((field) =>
        [" Первый экран ", "Текст колонки", "Призыв", "Внимание"].includes(
          field.value,
        ),
      )
      .map((field) => ({
        path: field.path,
        before: field.value,
        after: `Изменено: ${field.value}`,
      }));
    const patch = pageDraftTextAdapter.patch(page, changes);
    expect(Object.keys(patch).sort()).toEqual(["hero", "layout"]);
    const expected = fixture();
    expected.hero.richText.root.children[0].children[0].children[0].text =
      "Изменено:  Первый экран ";
    expected.layout[0].columns![0].richText.root.children[0].children[0].children[0].text =
      "Изменено: Текст колонки";
    expected.layout[1].richText!.root.children[0].children[0].children[0].text =
      "Изменено: Призыв";
    expected.layout[2].content!.root.children[0].children[0].children[0].text =
      "Изменено: Внимание";
    expect({ ...page, ...patch }).toEqual(expected);
    expect(page).toEqual(original);
  });
  it("позволяет добавить отсутствующие optional SEO строки и сохраняет соседние поля", () => {
    for (const meta of [undefined, null, { image: 31 }]) {
      const page = { ...fixture(), meta };
      expect(
        pageDraftTextAdapter
          .readFields(page)
          .find((field) => field.path === "/meta/title")?.value,
      ).toBe("");
      expect(
        pageDraftTextAdapter.patch(page, [
          { path: "/meta/title", before: "", after: "Новый SEO" },
        ]),
      ).toEqual({ meta: { ...(meta ?? {}), title: "Новый SEO" } });
    }
  });
  it("сравнивает before буквально и отказывает при перемещении leaf или произвольном пути", () => {
    const page = fixture();
    const field = pageDraftTextAdapter
      .readFields(page)
      .find((field) => field.value === " Первый экран ")!;
    for (const change of [
      { path: field.path, before: field.value.trim(), after: "Новый текст" },
      { path: "/slug", before: "about", after: "changed" },
      {
        path: "/layout/4/richText/root/children/0/children/0/children/0/text",
        before: "Закрытый текст формы",
        after: "Изменено",
      },
    ]) {
      expect(() => pageDraftTextAdapter.patch(page, [change])).toThrow();
    }
  });
  it("не заходит в Lexical upload, relationship или custom block children", () => {
    const nested = ["upload", "relationship", "block"].map((type) => ({
      type,
      children: [{ type: "text", text: "Недоступный текст" }],
    }));
    const page = {
      title: "Название",
      hero: { richText: { root: { type: "root", children: nested } } },
    };
    expect(
      pageDraftTextAdapter.readFields(page).map((field) => field.path),
    ).toEqual(["/title", "/meta/title", "/meta/description"]);
  });
  it("fail closed при превышении supported projection вместо молчаливого усечения", () => {
    const root = {
      type: "root",
      children: Array.from({ length: 128 }, () => ({
        type: "text",
        text: "Фрагмент",
      })),
    };
    expect(() =>
      pageDraftTextAdapter.readFields({
        title: "Название",
        hero: { richText: { root } },
      }),
    ).toThrow();
    expect(() =>
      pageDraftTextAdapter.readFields({
        title: "Название",
        hero: { richText: richText("a".repeat(4_001)) },
      }),
    ).toThrow();
  });
  it("сам повторно валидирует HTML, дубли и размер независимо от caller", () => {
    for (const changes of [
      [{ path: "/title", before: "О компании", after: "<b>HTML</b>" }],
      [{ path: "/title", before: "О компании", after: "a".repeat(161) }],
      [
        { path: "/title", before: "О компании", after: "Новое" },
        { path: "/title", before: "О компании", after: "Другое" },
      ],
    ]) {
      expect(() => pageDraftTextAdapter.patch(fixture(), changes)).toThrow();
    }
  });
});
