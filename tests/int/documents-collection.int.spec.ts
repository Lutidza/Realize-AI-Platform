// @vitest-environment node
/**
 * @file tests/int/documents-collection.int.spec.ts
 * @version 1.0.2
 * @date 2026-11-24
 * @description Проверяет закрытый доступ к документам и регрессии явных идентификаторов и частичных обновлений.
 * @see documentation/specifications/realize-ai-control-panel/documents/collection-and-access.md
 */
import type {
  Access,
  ArrayFieldValidation,
  TextareaFieldValidation,
  TextFieldSingleValidation,
} from "payload";
import { describe, expect, it } from "vitest";
import { Documents } from "../../src/collections/Documents";
import { isDocumentSlug } from "../../src/collections/Documents/documentIdentifiers";
import {
  validateDocumentIdentifier,
  validateDocumentParagraph,
  validateDocumentSections,
  validateDocumentTitle,
} from "../../src/collections/Documents/documentValidation.validators";

const options = {
  type: "text",
  name: "title",
  required: true,
  maxLength: 160,
  operation: "create",
  req: { payload: { config: {} }, t: (key: string) => key },
} as Parameters<TextFieldSingleValidation>[1];
const sectionOptions = {
  type: "array",
  name: "sections",
  required: true,
  operation: "create",
  req: options.req,
  blockData: {},
  data: {},
  path: [],
  preferences: { fields: {} },
  siblingData: {},
  minRows: 1,
  fields: [],
} as Parameters<ArrayFieldValidation>[1];
const paragraphOptions = {
  type: "textarea",
  name: "text",
  required: true,
  maxLength: 160,
  operation: "create",
  req: options.req,
} as Parameters<TextareaFieldValidation>[1];

describe("Закрытая коллекция Documents", () => {
  it("закрывает каждый CRUD для гостя и обычного пользователя", async () => {
    for (const operation of ["create", "read", "update", "delete"] as const) {
      const policy = Documents.access![operation]!;
      for (const user of [null, { roles: ["user"] }]) {
        const input = { req: { user } } as Parameters<Access>[0];
        expect(await policy(input)).toBe(false);
      }
      const input = {
        req: { user: { roles: ["admin"] } },
      } as Parameters<Access>[0];
      expect(await policy(input)).toBe(true);
    }
    expect(Documents.versions).toBeUndefined();
  });

  it("принимает явный slug без пересчёта и отклоняет whitespace и неоднозначные адреса", async () => {
    expect(isDocumentSlug("getting-started-2")).toBe(true);
    expect(isDocumentSlug("a".repeat(128))).toBe(true);
    for (const value of [
      "",
      "A",
      "document\n",
      "document\r",
      " document",
      "document ",
      "a--b",
      "a_2",
      "а",
      "../a",
      "a".repeat(129),
      null,
    ]) {
      expect(isDocumentSlug(value)).toBe(false);
    }
    expect(
      await validateDocumentIdentifier("getting-started-2", {
        ...options,
        maxLength: 128,
      }),
    ).toBe(true);
    expect(await validateDocumentIdentifier("document\n", options)).not.toBe(
      true,
    );
  });

  it("сохраняет штатный maxLength при собственной проверке пустого заголовка", async () => {
    expect(await validateDocumentTitle("Заголовок", options)).toBe(true);
    expect(await validateDocumentTitle(" \t\n", options)).not.toBe(true);
    expect(await validateDocumentTitle("a".repeat(161), options)).not.toBe(
      true,
    );
    expect(await validateDocumentTitle(null, options)).not.toBe(true);
  });

  it("не принимает пустой абзац и сохраняет plain text без преобразований", async () => {
    expect(
      await validateDocumentParagraph(
        "Текст <strong>без HTML обработки</strong>",
        paragraphOptions,
      ),
    ).toBe(true);
    expect(await validateDocumentParagraph("\n\t ", paragraphOptions)).not.toBe(
      true,
    );
    expect(await validateDocumentParagraph(null, paragraphOptions)).not.toBe(
      true,
    );
  });

  it("проверяет уникальность anchor независимо от native row id", async () => {
    const sections = [
      { id: "one", anchor: "intro" },
      { id: "two", anchor: "details" },
    ];
    expect(await validateDocumentSections(sections, sectionOptions)).toBe(true);
    expect(
      await validateDocumentSections(
        [
          { id: "one", anchor: "intro" },
          { id: "two", anchor: "intro" },
        ],
        sectionOptions,
      ),
    ).not.toBe(true);
    expect(
      await validateDocumentSections([{ id: "intro" }], sectionOptions),
    ).not.toBe(true);
    expect(
      await validateDocumentSections([{ anchor: "intro\n" }], sectionOptions),
    ).not.toBe(true);
    expect(await validateDocumentSections([], sectionOptions)).not.toBe(true);
  });

  it("сохраняет omitted поля при частичном update, но отклоняет явный null", async () => {
    const updateOptions = {
      ...options,
      operation: "update" as const,
      previousValue: "Existing",
    };
    expect(await validateDocumentTitle(undefined, updateOptions)).toBe(true);
    expect(await validateDocumentTitle(null, updateOptions)).not.toBe(true);
    expect(
      await validateDocumentIdentifier(undefined, {
        ...updateOptions,
        previousValue: "existing-slug",
      }),
    ).toBe(true);
    const sectionsUpdate = {
      ...sectionOptions,
      operation: "update" as const,
      previousValue: [{ anchor: "existing-section" }],
    };
    expect(await validateDocumentSections(undefined, sectionsUpdate)).toBe(
      true,
    );
    expect(await validateDocumentSections(null, sectionsUpdate)).not.toBe(true);
    expect(
      await validateDocumentParagraph(undefined, {
        ...paragraphOptions,
        operation: "update",
        previousValue: "Existing",
      }),
    ).toBe(true);
  });
});
