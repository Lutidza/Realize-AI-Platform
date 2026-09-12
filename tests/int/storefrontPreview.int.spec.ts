/**
 * @file tests/int/storefrontPreview.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет права предпросмотра и защиту чтения черновиков после потери сессии.
 */

// @vitest-environment node

import type { NextRequest } from "next/server";
import type { Payload, PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  disable: vi.fn(),
  draftMode: vi.fn(),
  enable: vi.fn(),
  find: vi.fn(),
  getPayload: vi.fn(),
  headers: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn() },
  redirect: vi.fn(),
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({ getPayload: mocks.getPayload }));
vi.mock("next/headers", () => ({
  draftMode: mocks.draftMode,
  headers: mocks.headers,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/RichText", () => ({ RichText: () => null }));
vi.mock("@/components/CollectionArchive", () => ({
  CollectionArchive: () => null,
}));
vi.mock("@/blocks/Carousel/Component.client", () => ({
  CarouselClient: () => null,
}));

import { GET } from "@/app/(app)/next/preview/route";
import { ArchiveBlock } from "@/blocks/ArchiveBlock/Component";
import { CarouselBlock } from "@/blocks/Carousel/Component";
import { generatePreviewPath } from "@/utilities/generatePreviewPath";
import { findPreviewDocumentBySlug } from "@/utilities/preview/findPreviewDocumentBySlug.service";
import { getPreviewUser } from "@/utilities/preview/getPreviewUser.service";
import { resolvePreviewPath } from "@/utilities/preview/resolvePreviewPath.validator";

const admin = { id: 1, collection: "users", roles: ["admin"] };
const customer = { id: 2, collection: "users", roles: ["customer"] };
const publishedDocument = {
  id: 3,
  title: "Публичный текст",
  _status: "published",
};
const draftDocument = { id: 3, title: "Закрытый черновик", _status: "draft" };
const payload = {
  auth: mocks.auth,
  find: mocks.find,
  logger: mocks.logger,
} as unknown as Payload;

function previewRequest(
  path: string | null = "/about",
  secret = "preview-test-secret",
) {
  const url = new URL("http://localhost:3000/next/preview");
  url.searchParams.set("previewSecret", secret);
  if (path !== null) url.searchParams.set("path", path);
  return new Request(url) as NextRequest;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PREVIEW_SECRET", "preview-test-secret");
  mocks.auth.mockResolvedValue({ user: admin, permissions: {} });
  mocks.getPayload.mockResolvedValue(payload);
  mocks.headers.mockResolvedValue(
    new Headers({ cookie: "test-session=active" }),
  );
  mocks.draftMode.mockResolvedValue({
    isEnabled: true,
    disable: mocks.disable,
    enable: mocks.enable,
  });
  mocks.find.mockImplementation(async ({ draft }: { draft: boolean }) => ({
    docs: [draft ? draftDocument : publishedDocument],
  }));
  mocks.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("preview authentication", () => {
  it("does not mistake the truthy Payload auth result for an authenticated user", async () => {
    mocks.auth.mockResolvedValue({ user: null, permissions: {} });
    expect(await getPreviewUser(payload, new Headers())).toBeNull();
  });

  it("accepts only an admin from the users collection", async () => {
    const requestHeaders = new Headers({ cookie: "test-session=active" });
    expect(await getPreviewUser(payload, requestHeaders)).toEqual(admin);
    expect(mocks.auth).toHaveBeenCalledWith(
      expect.objectContaining({ headers: requestHeaders }),
    );

    for (const user of [
      customer,
      { ...admin, collection: "other-users" },
      { ...admin, roles: [] },
    ]) {
      mocks.auth.mockResolvedValue({ user, permissions: {} });
      expect(await getPreviewUser(payload, requestHeaders)).toBeNull();
    }
  });

  it("denies preview when authentication throws", async () => {
    mocks.auth.mockRejectedValue(new Error("Session verification unavailable"));
    expect(await getPreviewUser(payload, new Headers())).toBeNull();
  });
});

describe("preview redirect path", () => {
  it("allows internal paths including normal encoded characters", () => {
    for (const path of [
      "/",
      "/about",
      "/products/example",
      "/о-компании",
      "/hello%20world",
    ]) {
      expect(resolvePreviewPath(path)).toBe(path);
    }
  });

  it("rejects external destinations and URL delimiter tricks", () => {
    for (const path of [
      null,
      "",
      "https://example.com/path",
      "//example.com/path",
      "/\\example.com",
      "/about?next=https://example.com",
      "/about#fragment",
      "/about\n",
      "/about\u0000",
    ]) {
      expect(resolvePreviewPath(path), String(path)).toBeNull();
    }
  });

  it("rejects encoded separators, dot segments and malformed encoding", () => {
    for (const path of [
      "/./about",
      "/products/../about",
      "/%2e/about",
      "/products/%2E%2e/about",
      "/%2fexample.com",
      "/%5cexample.com",
      "/about%0a",
      "/about%",
    ]) {
      expect(resolvePreviewPath(path), path).toBeNull();
    }
  });
});

describe("generated preview link", () => {
  const req = {} as PayloadRequest;

  it("does not produce a link without a nonempty server secret", () => {
    for (const secret of ["", undefined]) {
      vi.stubEnv("PREVIEW_SECRET", secret);
      expect(
        generatePreviewPath({ collection: "pages", slug: "about", req }),
      ).toBeNull();
    }
  });

  it("preserves the secret and a validated path for page and product links", () => {
    for (const collection of ["pages", "products"] as const) {
      const slug = "пример товара";
      const link = generatePreviewPath({ collection, slug, req });
      expect(link).not.toBeNull();
      const url = new URL(link!, "http://localhost:3000");
      const expectedPath = `${collection === "products" ? "/products" : ""}/${encodeURIComponent(slug)}`;
      expect(url.pathname).toBe("/next/preview");
      expect(url.searchParams.get("previewSecret")).toBe("preview-test-secret");
      expect(url.searchParams.get("path")).toBe(expectedPath);
      expect(resolvePreviewPath(url.searchParams.get("path"))).toBe(
        expectedPath,
      );
    }
  });

  it("does not produce preview links for invalid slugs", () => {
    for (const slug of [
      "",
      ".",
      "..",
      "../about",
      "path/segment",
      "path\\segment",
      "about?query",
      "about#fragment",
      "about\n",
    ]) {
      expect(
        generatePreviewPath({ collection: "pages", slug, req }),
        slug,
      ).toBeNull();
    }
  });
});

describe("preview entry route", () => {
  it("clears draft mode for an anonymous request even with the correct secret", async () => {
    mocks.auth.mockResolvedValue({ user: null, permissions: {} });
    expect((await GET(previewRequest())).status).toBe(403);
    expect(mocks.disable).toHaveBeenCalledOnce();
    expect(mocks.enable).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not grant a customer access to drafts", async () => {
    mocks.auth.mockResolvedValue({ user: customer, permissions: {} });
    expect((await GET(previewRequest())).status).toBe(403);
    expect(mocks.disable).toHaveBeenCalledOnce();
    expect(mocks.enable).not.toHaveBeenCalled();
  });

  it("clears draft mode when authentication fails", async () => {
    mocks.auth.mockRejectedValue(new Error("Invalid session"));
    expect((await GET(previewRequest())).status).toBe(403);
    expect(mocks.disable).toHaveBeenCalledOnce();
    expect(mocks.enable).not.toHaveBeenCalled();
  });

  it("requires a matching nonempty server secret", async () => {
    expect((await GET(previewRequest("/about", "wrong-secret"))).status).toBe(
      403,
    );
    vi.stubEnv("PREVIEW_SECRET", "");
    expect((await GET(previewRequest("/about", ""))).status).toBe(403);
    vi.stubEnv("PREVIEW_SECRET", undefined);
    expect((await GET(previewRequest("/about", ""))).status).toBe(403);
    expect(mocks.disable).toHaveBeenCalledTimes(3);
    expect(mocks.enable).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("rejects an unsafe or missing target before enabling draft mode", async () => {
    expect((await GET(previewRequest("//example.com"))).status).toBe(400);
    expect((await GET(previewRequest(null))).status).toBe(400);
    expect(mocks.disable).toHaveBeenCalledTimes(2);
    expect(mocks.enable).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("enables draft mode and redirects an authenticated admin to the validated path", async () => {
    await expect(GET(previewRequest("/products/example"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.enable).toHaveBeenCalledOnce();
    expect(mocks.disable).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/products/example");
  });
});

describe.each(["pages", "products"] as const)(
  "%s document preview",
  (collection) => {
    it("reads an admin draft through collection access with the authenticated user", async () => {
      expect(
        await findPreviewDocumentBySlug({ collection, slug: "example" }),
      ).toEqual(draftDocument);
      expect(mocks.find).toHaveBeenCalledWith(
        expect.objectContaining({
          collection,
          draft: true,
          overrideAccess: false,
          user: admin,
          where: { and: [{ slug: { equals: "example" } }] },
        }),
      );
    });

    it("uses the published version for anonymous and customer sessions with a retained draft cookie", async () => {
      for (const user of [null, customer]) {
        mocks.auth.mockResolvedValue({ user, permissions: {} });
        expect(
          await findPreviewDocumentBySlug({ collection, slug: "example" }),
        ).toEqual(publishedDocument);
        expect(mocks.find).toHaveBeenLastCalledWith(
          expect.objectContaining({
            collection,
            draft: false,
            overrideAccess: false,
            user: null,
            where: {
              and: [
                { slug: { equals: "example" } },
                { _status: { equals: "published" } },
              ],
            },
          }),
        );
      }
    });

    it("checks the session again after logout and role revocation on subsequent reads", async () => {
      mocks.auth
        .mockResolvedValueOnce({ user: admin })
        .mockResolvedValueOnce({ user: null })
        .mockResolvedValueOnce({ user: admin })
        .mockResolvedValueOnce({ user: { ...admin, roles: ["customer"] } });
      const read = () =>
        findPreviewDocumentBySlug({ collection, slug: "example" });
      expect(await read()).toEqual(draftDocument);
      expect(await read()).toEqual(publishedDocument);
      expect(await read()).toEqual(draftDocument);
      expect(await read()).toEqual(publishedDocument);
      expect(mocks.auth).toHaveBeenCalledTimes(4);
      expect(
        mocks.find.mock.calls.every(
          ([query]) => query.overrideAccess === false,
        ),
      ).toBe(true);
    });

    it("keeps normal storefront reads published even for an admin", async () => {
      mocks.draftMode.mockResolvedValue({
        isEnabled: false,
        disable: mocks.disable,
        enable: mocks.enable,
      });
      expect(
        await findPreviewDocumentBySlug({ collection, slug: "example" }),
      ).toEqual(publishedDocument);
      expect(mocks.find).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: false,
          overrideAccess: false,
          user: null,
          where: {
            and: [
              { slug: { equals: "example" } },
              { _status: { equals: "published" } },
            ],
          },
        }),
      );
    });

    it("falls back to published access after an authentication failure and returns null for absent documents", async () => {
      mocks.auth.mockRejectedValue(new Error("Session unavailable"));
      mocks.find.mockResolvedValue({ docs: [] });
      expect(
        await findPreviewDocumentBySlug({ collection, slug: "draft-only" }),
      ).toBeNull();
      expect(mocks.find).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: false,
          overrideAccess: false,
          user: null,
        }),
      );
    });
  },
);

it("preserves product depth and variant fields needed by the storefront", async () => {
  await findPreviewDocumentBySlug({ collection: "products", slug: "example" });
  expect(mocks.find).toHaveBeenCalledWith(
    expect.objectContaining({
      depth: 3,
      populate: {
        variants: {
          title: true,
          priceInUSD: true,
          inventory: true,
          options: true,
        },
      },
    }),
  );
});

it("keeps archive and carousel collection queries under public access even during preview", async () => {
  await ArchiveBlock({
    blockType: "archive",
    populateBy: "collection",
    categories: [7],
    limit: 4,
  });
  await CarouselBlock({
    blockType: "carousel",
    populateBy: "collection",
    categories: [7],
    limit: 4,
  });

  expect(mocks.find).toHaveBeenCalledTimes(2);
  for (const [query] of mocks.find.mock.calls) {
    expect(query).toEqual(
      expect.objectContaining({
        collection: "products",
        draft: false,
        overrideAccess: false,
        limit: 4,
        where: { categories: { in: [7] } },
      }),
    );
    expect(query.user ?? null).toBeNull();
  }
});
