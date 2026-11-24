// @vitest-environment node
/**
 * @file tests/int/document-article-actions.int.spec.ts
 * @version 1.1.2
 * @date 2026-11-24
 * @description Проверяет серверную границу формы статьи и восстановление после сбоя сохранения.
 * @see documentation/specifications/realize-ai-control-panel/documents/creation.md
 */
import { ValidationError } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkCreatedDocumentArticleAction,
  createDocumentArticleAction,
} from "../../src/components/admin/documents/createDocumentArticle.action";
import { matchesSubmittedDocumentArticle } from "../../src/components/admin/documents/matchesSubmittedDocumentArticle.util";
import { suggestDocumentIdentifier } from "../../src/components/admin/documents/suggestDocumentIdentifier.util";
import type { DocumentArticleInput } from "../../src/components/admin/documents/DocumentArticleForm.types";

const { actor, create, find, revalidatePath } = vi.hoisted(() => ({
  actor: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock(
  "../../src/components/admin/documents/readDocumentsBrowserActor.service",
  () => ({
    readDocumentsBrowserActor: actor,
  }),
);

const input: DocumentArticleInput = {
  title: "Как настроить макет",
  slug: "custom-layout-address",
  description: "",
  sections: [
    {
      title: "Первый запуск",
      anchor: "pervyi-zapusk",
      paragraphs: [{ text: " Первое действие. " }],
    },
    {
      title: "Проверка",
      anchor: "proverka",
      paragraphs: [{ text: "Второе действие." }],
    },
  ],
};
const admin = { id: 7, collection: "users", roles: ["admin"] };

beforeEach(() => {
  vi.resetAllMocks();
  actor.mockResolvedValue({ user: admin, payload: { create, find } });
});

describe("Создание статьи внутренней документации", () => {
  it("предлагает стабильный адрес и сохраняет поля для ручной правки", () => {
    expect(suggestDocumentIdentifier(input.title)).toBe("kak-nastroit-maket");
    expect(suggestDocumentIdentifier(input.sections[0].title)).toBe(
      "pervyi-zapusk",
    );
    expect(suggestDocumentIdentifier("École — 42 / Ёж")).toBe("ecole-42-ezh");
    expect(suggestDocumentIdentifier("— 😺 —")).toBe("");
    expect(suggestDocumentIdentifier(`${"x".repeat(127)} y`)).toBe(
      "x".repeat(127),
    );
  });

  it("проверяет доступ до чтения и записи", async () => {
    actor.mockResolvedValue(null);
    await expect(createDocumentArticleAction(input)).resolves.toEqual({
      status: "forbidden",
    });
    await expect(
      checkCreatedDocumentArticleAction(input.slug),
    ).resolves.toEqual({
      status: "forbidden",
    });
    expect(create).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("передаёт точный ручной адрес и содержимое, применяя ACL Payload", async () => {
    create.mockResolvedValue({ slug: input.slug });
    await expect(createDocumentArticleAction(input)).resolves.toEqual({
      status: "created",
      slug: input.slug,
    });
    expect(create).toHaveBeenCalledExactlyOnceWith({
      collection: "documents",
      user: admin,
      overrideAccess: false,
      depth: 0,
      data: input,
      select: { slug: true },
    });
    expect(revalidatePath.mock.calls).toEqual([
      ["/system/documents"],
      ["/system/documents/custom-layout-address"],
    ]);
  });

  it("указывает точные поля пустого текста и повторяющегося адреса без записи", async () => {
    const invalid: DocumentArticleInput = {
      ...input,
      title: "\n ",
      sections: [
        input.sections[0],
        {
          ...input.sections[1],
          anchor: input.sections[0].anchor,
          paragraphs: [{ text: " \t" }],
        },
      ],
    };
    await expect(createDocumentArticleAction(invalid)).resolves.toMatchObject({
      status: "invalid",
      fields: {
        title: expect.any(String),
        "sections.1.anchor": expect.any(String),
        "sections.1.paragraphs.0.text": expect.any(String),
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    new ValidationError({
      collection: "documents",
      errors: [{ path: "slug", message: "internal detail" }],
    }),
    Object.assign(new Error("internal detail"), {
      name: "j",
      status: 400,
      isOperational: true,
      data: {
        collection: "documents",
        errors: [
          {
            path: "slug",
            message: "Value must be unique",
            tableName: "documents",
          },
        ],
      },
    }),
    new Error("driver detail", {
      cause: { code: "23505", constraint: "documents_slug_idx" },
    }),
  ])(
    "привязывает конфликт уникальности к slug и скрывает детали хранилища (%#)",
    async (error) => {
      create.mockRejectedValue(error);
      await expect(createDocumentArticleAction(input)).resolves.toEqual({
        status: "invalid",
        fields: { slug: "Этот адрес статьи уже используется." },
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("не превращает постороннюю ошибку в конфликт адреса статьи", async () => {
    create.mockRejectedValue({
      status: 400,
      isOperational: true,
      data: {
        collection: "users",
        errors: [{ path: "slug", message: "internal detail" }],
      },
    });
    await expect(createDocumentArticleAction(input)).resolves.toEqual({
      status: "uncertain",
    });
  });

  it("при неизвестном результате отличает точную статью, конфликт и отсутствие записи", async () => {
    create.mockRejectedValue(new Error("connection interrupted"));
    await expect(createDocumentArticleAction(input)).resolves.toEqual({
      status: "uncertain",
    });
    find.mockResolvedValueOnce({ docs: [] });
    await expect(
      checkCreatedDocumentArticleAction(input.slug),
    ).resolves.toEqual({
      status: "missing",
    });
    find.mockResolvedValueOnce({
      docs: [
        {
          ...input,
          id: 42,
          description: null,
          sections: input.sections.map((section) => ({
            ...section,
            id: "private-row-id",
            paragraphs: section.paragraphs.map((item) => ({
              ...item,
              id: "private-id",
            })),
          })),
        },
      ],
    });
    const result = await checkCreatedDocumentArticleAction(input.slug);
    expect(result).toEqual({ status: "found", article: input });
    if (result.status !== "found")
      throw new Error("Ожидалась сохранённая статья");
    expect(matchesSubmittedDocumentArticle(result.article, input)).toBe(true);
    expect(
      matchesSubmittedDocumentArticle(result.article, {
        ...input,
        sections: input.sections.toReversed(),
      }),
    ).toBe(false);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        user: admin,
        overrideAccess: false,
        where: { slug: { equals: input.slug } },
      }),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("проверяет формат slug до чтения результата записи", async () => {
    await expect(
      checkCreatedDocumentArticleAction("invalid/slug"),
    ).resolves.toEqual({
      status: "unavailable",
    });
    expect(find).not.toHaveBeenCalled();
  });
});
