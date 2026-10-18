/**
 * @file tests/int/storefrontDatabaseFreeBuild.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-18
 * @description Проверяет отложенную загрузку категорий и preview-документов при сборке storefront без БД.
 * @see documentation/delivery/01-local-admin-ai.md
 */

// @vitest-environment node

import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "@/payload-types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getPayload: vi.fn(),
  find: vi.fn(),
  draftMode: vi.fn(),
  headers: vi.fn(),
  auth: vi.fn(),
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({ getPayload: mocks.getPayload }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/headers", () => ({
  draftMode: mocks.draftMode,
  headers: mocks.headers,
}));

import { Categories } from "@/components/layout/search/Categories";
import { CategoryItem } from "@/components/layout/search/Categories.client";
import { findPreviewDocumentBySlug } from "@/utilities/preview/findPreviewDocumentBySlug.service";

const requestHeaders = new Headers({ "x-preview-test": "request" });

const categories: Category[] = [
  {
    id: 1,
    title: "Одежда",
    slug: "clothing",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
  },
  {
    id: 2,
    title: "Книги",
    slug: "books",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
  },
];

/** Вызывает async child публичного компонента без отдельного тестового экспорта. */
function renderCategoryList() {
  const child = Categories().props.children as ReactElement<
    unknown,
    () => Promise<ReactElement<{ children: ReactNode }>>
  >;
  return child.type();
}

function readCategoryProps(node: ReactNode): Category[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ category?: Category; children?: ReactNode }>(child))
      return [];
    if (child.type === CategoryItem && child.props.category)
      return [child.props.category];
    return readCategoryProps(child.props.children);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("REALIZE_BUILD_WITHOUT_DATABASE", "true");
  mocks.connection.mockResolvedValue(undefined);
  mocks.getPayload.mockResolvedValue({ find: mocks.find, auth: mocks.auth });
  mocks.find.mockResolvedValue({ docs: categories });
  mocks.draftMode.mockResolvedValue({ isEnabled: false });
  mocks.headers.mockResolvedValue(requestHeaders);
  mocks.auth.mockResolvedValue({ user: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Категории storefront при сборке без БД", () => {
  it("пробрасывает Next dynamic bailout до обращения к Payload", async () => {
    const bailout = Object.assign(new Error("Ожидается запрос"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    mocks.connection.mockRejectedValue(bailout);

    await expect(renderCategoryList()).rejects.toBe(bailout);

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.getPayload).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("не начинает запрос категорий до завершения connection", async () => {
    const connection = Promise.withResolvers<void>();
    mocks.connection.mockReturnValue(connection.promise);

    const rendering = renderCategoryList();
    await Promise.resolve();

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.getPayload).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();

    connection.resolve();
    const result = await rendering;

    expect(mocks.getPayload).toHaveBeenCalledOnce();
    expect(mocks.find).toHaveBeenCalledExactlyOnceWith({
      collection: "categories",
      sort: "title",
    });
    expect(readCategoryProps(result)).toEqual(categories);
  });

  it.each(["false", undefined])(
    "сохраняет загрузку категорий без connection при флаге %s",
    async (flag) => {
      vi.stubEnv("REALIZE_BUILD_WITHOUT_DATABASE", flag);

      const result = await renderCategoryList();

      expect(mocks.connection).not.toHaveBeenCalled();
      expect(mocks.getPayload).toHaveBeenCalledOnce();
      expect(mocks.find).toHaveBeenCalledExactlyOnceWith({
        collection: "categories",
        sort: "title",
      });
      expect(readCategoryProps(result)).toEqual(categories);
    },
  );

  it("не маскирует ошибки инициализации Payload и чтения категорий", async () => {
    const initializationError = new Error("Payload недоступен");
    mocks.getPayload.mockRejectedValueOnce(initializationError);

    await expect(renderCategoryList()).rejects.toBe(initializationError);
    expect(mocks.find).not.toHaveBeenCalled();

    const queryError = new Error("Категории недоступны");
    mocks.find.mockRejectedValueOnce(queryError);

    await expect(renderCategoryList()).rejects.toBe(queryError);
    expect(mocks.find).toHaveBeenCalledOnce();
  });
});

describe("Чтение preview-документа при сборке без БД", () => {
  const collections = ["pages", "products"] as const;
  const document = { id: 42, slug: "sample" };
  const admin = { id: 1, collection: "users", roles: ["admin"] };
  const customer = { id: 2, collection: "users", roles: ["customer"] };
  const modes = [
    ["публичное чтение", false, null, false],
    ["preview администратора", true, admin, true],
    ["preview без сессии", true, null, false],
    ["preview без роли admin", true, customer, false],
  ] as const;

  it.each(collections)(
    "пробрасывает Next bailout до БД для %s при выключенном draftMode",
    async (collection) => {
      const bailout = Object.assign(new Error("Ожидается запрос"), {
        digest: "DYNAMIC_SERVER_USAGE",
      });
      mocks.connection.mockRejectedValue(bailout);

      await expect(
        findPreviewDocumentBySlug({ collection, slug: "sample" }),
      ).rejects.toBe(bailout);

      expect(mocks.connection).toHaveBeenCalledOnce();
      expect(mocks.getPayload).not.toHaveBeenCalled();
      expect(mocks.find).not.toHaveBeenCalled();
    },
  );

  it.each(
    collections.flatMap((collection) =>
      modes.map(([name, isEnabled, user, draft]) => ({
        collection,
        name,
        isEnabled,
        user,
        draft,
      })),
    ),
  )(
    "$collection: ожидает connection и сохраняет контракт — $name",
    async ({ collection, isEnabled, user, draft }) => {
      const connection = Promise.withResolvers<void>();
      mocks.connection.mockReturnValue(connection.promise);
      mocks.draftMode.mockResolvedValue({ isEnabled });
      mocks.auth.mockResolvedValue({ user });
      mocks.find.mockResolvedValue({ docs: [document] });

      const reading = findPreviewDocumentBySlug({ collection, slug: "sample" });
      await Promise.resolve();

      expect(mocks.connection).toHaveBeenCalledOnce();
      expect(mocks.getPayload).not.toHaveBeenCalled();
      expect(mocks.find).not.toHaveBeenCalled();
      expect(mocks.auth).not.toHaveBeenCalled();

      connection.resolve();
      expect(await reading).toBe(document);
      expect(mocks.getPayload).toHaveBeenCalledOnce();
      expect(mocks.find).toHaveBeenCalledExactlyOnceWith({
        collection,
        draft,
        user: draft ? user : null,
        overrideAccess: false,
        limit: 1,
        pagination: false,
        where: {
          and: [
            { slug: { equals: "sample" } },
            ...(draft ? [] : [{ _status: { equals: "published" } }]),
          ],
        },
        ...(collection === "products"
          ? {
              depth: 3,
              populate: {
                variants: {
                  title: true,
                  priceInUSD: true,
                  inventory: true,
                  options: true,
                },
              },
            }
          : {}),
      });
      if (isEnabled) {
        expect(mocks.auth).toHaveBeenCalledExactlyOnceWith({
          headers: requestHeaders,
        });
      } else {
        expect(mocks.headers).not.toHaveBeenCalled();
        expect(mocks.auth).not.toHaveBeenCalled();
      }
    },
  );

  it.each(
    collections.flatMap((collection) =>
      ["false", undefined].map((flag) => ({ collection, flag })),
    ),
  )(
    "$collection: читает документ без connection при флаге $flag",
    async ({ collection, flag }) => {
      vi.stubEnv("REALIZE_BUILD_WITHOUT_DATABASE", flag);
      mocks.find.mockResolvedValue({ docs: [document] });

      expect(
        await findPreviewDocumentBySlug({ collection, slug: "sample" }),
      ).toBe(document);

      expect(mocks.connection).not.toHaveBeenCalled();
      expect(mocks.getPayload).toHaveBeenCalledOnce();
      expect(mocks.find).toHaveBeenCalledOnce();
    },
  );

  it.each(collections)(
    "не маскирует ошибки Payload и чтения %s",
    async (collection) => {
      const initializationError = new Error("Payload недоступен");
      mocks.getPayload.mockRejectedValueOnce(initializationError);

      await expect(
        findPreviewDocumentBySlug({ collection, slug: "sample" }),
      ).rejects.toBe(initializationError);
      expect(mocks.find).not.toHaveBeenCalled();

      const queryError = new Error("Документ недоступен");
      mocks.find.mockRejectedValueOnce(queryError);

      await expect(
        findPreviewDocumentBySlug({ collection, slug: "sample" }),
      ).rejects.toBe(queryError);
      expect(mocks.find).toHaveBeenCalledOnce();
    },
  );
});
