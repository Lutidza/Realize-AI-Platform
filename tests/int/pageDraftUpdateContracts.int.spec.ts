// @vitest-environment node
/**
 * @file tests/int/pageDraftUpdateContracts.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Проверяет строгие границы контекста страницы, browser reference и точного текстового diff.
 */
import { describe, expect, it } from "vitest";
import {
  parseDataOperationIntent,
  parsePageDraftContext,
  parsePageDraftReference,
  parseUpdatePageDraftIntent,
} from "@realize/ai-contracts";

const path = "/hero/richText/root/children/0/children/0/text";
const intent = () => ({
  version: "1.0",
  kind: "pages.updateDraft.v1",
  pageID: "17",
  expectedUpdatedAt: "2026-09-12T10:00:00.000Z",
  expectedFingerprint: "a".repeat(64),
  changes: [{ path, before: "  Исходный текст  ", after: " Короткий текст " }],
});
const context = () => ({
  page: { id: "17", title: "О компании", slug: "about" },
  updatedAt: "2026-09-12T10:00:00.000Z",
  fingerprint: "a".repeat(64),
  adapterVersion: "1.0",
  fields: [
    { path, label: "Первый экран", value: "Исходный текст", maxLength: 4_000 },
  ],
});

describe("Контракты редактирования черновика", () => {
  it("сохраняет пробелы точного diff и discriminant общей Data Lane", () => {
    expect(parseUpdatePageDraftIntent(intent())).toEqual(intent());
    expect(parseDataOperationIntent(intent())).toEqual(intent());
  });
  it.each(["slug", "_status", "layout", "relationships", "page"])(
    "отклоняет неподдерживаемое поле intent %s",
    (key) => {
      expect(() =>
        parseUpdatePageDraftIntent({ ...intent(), [key]: "unsafe" }),
      ).toThrow();
    },
  );
  it.each([
    "/slug",
    "/_status",
    "/meta/image",
    "/layout/0/columns/0/link/url",
    "/__proto__/text",
    "/hero/richText/root/children/00/text",
    "/hero/richText/root/children/0/fields/text",
  ])("не принимает путь %s", (path) => {
    expect(() =>
      parseUpdatePageDraftIntent({
        ...intent(),
        changes: [{ path, before: "a", after: "b" }],
      }),
    ).toThrow();
  });
  it.each([
    "<script>alert(1)</script>",
    "<a href='x'>x</a>",
    "a\u0000b",
    "a\u001bb",
    "a\u0085b",
  ])("отклоняет HTML и управляющие символы", (after) => {
    expect(() =>
      parseUpdatePageDraftIntent({
        ...intent(),
        changes: [{ path, before: "a", after }],
      }),
    ).toThrow();
  });
  it("сохраняет исторический HTML буквально в before и позволяет заменить его обычным текстом", () => {
    const value = {
      ...intent(),
      changes: [
        { path, before: " <b>Старый текст</b> ", after: "Новый текст" },
      ],
    };
    expect(parseUpdatePageDraftIntent(value).changes).toEqual(value.changes);
  });
  it("отклоняет пустую операцию, дубли, no-op, дополнительное поле и превышение числа изменений", () => {
    for (const changes of [
      [],
      [...intent().changes, ...intent().changes],
      [{ path, before: "a", after: "a" }],
      [{ path, before: "a", after: "b", field: "title" }],
      Array.from({ length: 33 }, (_, index) => ({
        path: `/hero/richText/root/children/${index}/text`,
        before: "a",
        after: "b",
      })),
    ]) {
      expect(() =>
        parseUpdatePageDraftIntent({ ...intent(), changes }),
      ).toThrow();
    }
  });
  it("считает общий лимит в UTF-8, включая before и after", () => {
    const changes = Array.from({ length: 5 }, (_, index) => ({
      path: `/hero/richText/root/children/${index}/text`,
      before: "я".repeat(2_000),
      after: "ю".repeat(2_000),
    }));
    expect(() => parseUpdatePageDraftIntent({ ...intent(), changes })).toThrow(
      /32 KiB/,
    );
  });
  it("допускает очистку SEO, но сохраняет обязательный title и лимиты", () => {
    expect(
      parseUpdatePageDraftIntent({
        ...intent(),
        changes: [{ path: "/meta/title", before: "SEO", after: "" }],
      }).changes[0].after,
    ).toBe("");
    for (const [path, after] of [
      ["/title", "  "],
      ["/title", "a".repeat(161)],
      ["/meta/description", "a".repeat(321)],
    ]) {
      expect(() =>
        parseUpdatePageDraftIntent({
          ...intent(),
          changes: [{ path, before: "a", after }],
        }),
      ).toThrow();
    }
  });
  it.each([
    { pageID: "../17" },
    { expectedFingerprint: "bad" },
    { expectedUpdatedAt: "2026-02-30T10:00:00.000Z" },
    { expectedUpdatedAt: "2026-09-12" },
    { version: "2.0" },
  ])("проверяет идентичность и ревизию", (override) => {
    expect(() =>
      parseUpdatePageDraftIntent({ ...intent(), ...override }),
    ).toThrow();
  });
  it("принимает ограниченный context, но browser может передать только id и fingerprint", () => {
    expect(parsePageDraftContext(context())).toEqual(context());
    const reference = { id: "17", fingerprint: "a".repeat(64) };
    expect(parsePageDraftReference(reference)).toEqual(reference);
    expect(() =>
      parsePageDraftReference({ ...reference, fields: context().fields }),
    ).toThrow();
    expect(() =>
      parsePageDraftReference({ ...reference, updatedAt: context().updatedAt }),
    ).toThrow();
  });
  it("не выдаёт raw page fields или произвольные field attributes за transport boundary", () => {
    expect(() =>
      parsePageDraftContext({
        ...context(),
        page: { ...context().page, hero: {} },
      }),
    ).toThrow();
    expect(() =>
      parsePageDraftContext({
        ...context(),
        fields: [{ ...context().fields[0], permission: true }],
      }),
    ).toThrow();
    expect(() =>
      parsePageDraftContext({
        ...context(),
        fields: [{ ...context().fields[0], maxLength: 8_000 }],
      }),
    ).toThrow();
    expect(() =>
      parsePageDraftContext({
        ...context(),
        fields: [...context().fields, ...context().fields],
      }),
    ).toThrow();
  });
  it("не принимает oversized context или больше 128 полей", () => {
    const fields = Array.from({ length: 17 }, (_, index) => ({
      ...context().fields[0],
      path: `/hero/richText/root/children/${index}/text`,
      value: "я".repeat(2_000),
    }));
    expect(() => parsePageDraftContext({ ...context(), fields })).toThrow(
      /64 KiB/,
    );
    expect(() =>
      parsePageDraftContext({
        ...context(),
        fields: Array.from({ length: 129 }, (_, index) => ({
          ...context().fields[0],
          path: `/hero/richText/root/children/${index}/text`,
        })),
      }),
    ).toThrow();
  });
});
