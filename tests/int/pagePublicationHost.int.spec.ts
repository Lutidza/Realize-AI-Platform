// @vitest-environment node
/**
 * @file tests/int/pagePublicationHost.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-14
 * @description Проверяет статическую политику публикации, ACL и инвалидацию только после commit.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import { pagePublicationAdapter } from "../../src/collections/Pages/pagePublication.adapter";
import { mapAIPageDraftContent } from "../../src/collections/Pages/mapAIPageDraft.mapper";
import { Pages } from "../../src/collections/Pages";

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag: vi.fn() }));

const fixture = () => {
  const page = {
    id: 19,
    title: "Доставка",
    slug: "delivery",
    _status: "draft",
    publishedOn: null,
    ...mapAIPageDraftContent({
      version: "1.0",
      kind: "pages.createDraft.v1",
      title: "Доставка",
      slug: "delivery",
      sections: [{ body: "Привезём завтра." }],
    }),
  } as Record<string, unknown>;
  const find = vi.fn();
  const findByID = vi.fn();
  const req = {
    user: { id: 1, collection: "users", roles: ["admin"] },
    context: { disableRevalidate: true },
    payload: {
      config: { serverURL: "http://localhost:3000", routes: { api: "/api" } },
      collections: { pages: { config: { fields: Pages.fields } } },
      find,
      findByID,
    },
  } as unknown as PayloadRequest;
  return {
    page,
    req,
    find,
    findByID,
    check: () => pagePublicationAdapter.check(page, req),
  };
};
const failures = (
  result: Awaited<ReturnType<typeof pagePublicationAdapter.check>>,
) =>
  result.checks.filter(
    (check) => check.severity === "error" && check.status !== "passed",
  );
const heroText = (page: Record<string, unknown>) =>
  (
    (page.hero as Record<string, unknown>).richText as {
      root: { children: unknown[] };
    }
  ).root;
afterEach(() => {
  revalidatePath.mockReset();
});

describe("Host публикации статической Pages", () => {
  it("разрешает только текущего администратора Users", async () => {
    const f = fixture();
    expect(await pagePublicationAdapter.canPublish(f.req)).toBe(true);
    const user = f.req.user!;
    f.req.user = { ...user, roles: ["customer"] };
    expect(await pagePublicationAdapter.canPublish(f.req)).toBe(false);
    f.req.user = null;
    expect(await pagePublicationAdapter.canPublish(f.req)).toBe(false);
  });
  it("проверяет publish и restore одной политикой без чтения зависимостей и изменения страницы", async () => {
    const f = fixture();
    const columns = (
      f.page.layout as { columns: Record<string, unknown>[] }[]
    )[0].columns;
    columns[0].link = {
      type: "custom",
      label: "",
      url: "",
      newTab: false,
      appearance: "default",
      reference: { relationTo: null, value: null },
    };
    f.page.meta = {
      title: "Доставка",
      description: "Условия доставки",
      image: null,
    };
    const before = structuredClone(f.page);
    const first = await f.check();
    expect(failures(first)).toEqual([]);
    expect(f.page).toEqual(before);
    expect(first.checks).toContainEqual(
      expect.objectContaining({ id: "static-content", status: "passed" }),
    );
    expect(first.checks).toContainEqual(
      expect.objectContaining({
        id: "publication-shell",
        status: "not_checked",
        severity: "warning",
      }),
    );
    expect(
      first.checks.some((check) => check.id === "publication-validation"),
    ).toBe(false);
    f.page._status = "published";
    const restored = await f.check();
    expect(failures(restored)).toEqual([]);
    expect(restored.policyHash).toBe(first.policyHash);
    expect(f.find).not.toHaveBeenCalled();
    expect(f.findByID).not.toHaveBeenCalled();
  });
  it.each([
    "hero-media",
    "seo-media",
    "media-block",
    "form",
    "archive",
    "cta",
    "internal-link",
    "external-link",
    "upload-node",
    "unknown-node",
    "unknown-text-field",
    "enabled-link",
    "hidden-url",
    "hidden-reference",
    "unknown-page-field",
  ])(
    "блокирует изменяемую или неизвестную зависимость до Local API: %s",
    async (reason) => {
      const f = fixture();
      if (reason === "hero-media")
        (f.page.hero as Record<string, unknown>).media = 5;
      if (reason === "seo-media") f.page.meta = { image: 5 };
      if (["media-block", "form", "archive", "cta"].includes(reason))
        f.page.layout = [
          {
            blockType:
              reason === "media-block"
                ? "mediaBlock"
                : reason === "form"
                  ? "formBlock"
                  : reason,
            media: 5,
            form: 8,
          },
        ];
      if (
        [
          "internal-link",
          "external-link",
          "upload-node",
          "unknown-node",
          "unknown-text-field",
        ].includes(reason)
      )
        heroText(f.page).children = [
          reason === "unknown-text-field"
            ? {
                type: "text",
                version: 1,
                text: "Текст",
                secretReference: { relationTo: "media", value: 5 },
              }
            : reason === "upload-node"
              ? { type: "upload", version: 1, relationTo: "media", value: 5 }
              : reason === "unknown-node"
                ? { type: "custom-widget", version: 1 }
                : {
                    type: "link",
                    version: 1,
                    fields: {
                      linkType:
                        reason === "internal-link" ? "internal" : "custom",
                      url: "https://example.com",
                      doc: { relationTo: "pages", value: 20 },
                    },
                    children: [],
                  },
        ];
      if (["enabled-link", "hidden-url", "hidden-reference"].includes(reason)) {
        const column = (
          f.page.layout as { columns: Record<string, unknown>[] }[]
        )[0].columns[0];
        column.enableLink = reason === "enabled-link";
        column.link =
          reason === "hidden-reference"
            ? { reference: { relationTo: "pages", value: 20 } }
            : { type: "custom", url: "/contacts" };
      }
      if (reason === "unknown-page-field") f.page.foreignWidget = { media: 5 };
      expect(failures(await f.check()).length).toBeGreaterThan(0);
      expect(f.find).not.toHaveBeenCalled();
      expect(f.findByID).not.toHaveBeenCalled();
    },
  );
  it("сохраняет проверки содержимого страницы для обязательных полей, CSS и schema drift", async () => {
    const f = fixture();
    f.page.layout = [{ blockType: "banner", style: "info", content: null }];
    expect(failures(await f.check()).length).toBeGreaterThan(0);
    f.page.layout = [
      {
        blockType: "banner",
        style: "info",
        content: (f.page.hero as Record<string, unknown>).richText,
      },
    ];
    expect(failures(await f.check())).toEqual([]);
    heroText(f.page).children = [
      { type: "text", version: 1, text: "Невидимый", style: "display:none" },
    ];
    expect(failures(await f.check()).length).toBeGreaterThan(0);
    f.req.payload.collections.pages.config.fields = [];
    expect(failures(await f.check()).length).toBeGreaterThan(0);
  });
  it("ограничивает структуру и служебные slug до проверки публикации", async () => {
    const f = fixture();
    f.page.slug = "api";
    expect(failures(await f.check()).length).toBeGreaterThan(0);
    f.page.slug = "delivery";
    f.page.layout = Array.from({ length: 1001 }, () => ({
      blockType: "content",
      columns: [],
    }));
    expect(failures(await f.check()).length).toBeGreaterThan(0);
    expect(f.find).not.toHaveBeenCalled();
  });

  it.each([
    "missing-title",
    "empty-layout",
    "invalid-size",
    "invalid-enable-link",
    "invalid-block-id",
    "invalid-banner-style",
    "invalid-root",
    "node-version",
    "node-mode",
    "node-format",
    "heading-tag",
    "list-tag",
    "list-start",
    "list-item-checked",
    "long-text",
    "deep-text",
  ])(
    "сохраняет семантический запрет публикации после удаления отдельного preview: %s",
    async (reason) => {
      const f = fixture();
      const root = heroText(f.page);
      const column = (
        f.page.layout as { columns: Record<string, unknown>[] }[]
      )[0].columns[0];
      if (reason === "missing-title") f.page.title = " ";
      if (reason === "empty-layout") f.page.layout = [];
      if (reason === "invalid-size") column.size = "unknown";
      if (reason === "invalid-enable-link") column.enableLink = "false";
      if (reason === "invalid-block-id")
        (f.page.layout as Record<string, unknown>[])[0].id = 8;
      if (reason === "invalid-banner-style")
        f.page.layout = [
          {
            blockType: "banner",
            style: "custom",
            content: (f.page.hero as Record<string, unknown>).richText,
          },
        ];
      if (reason === "invalid-root")
        (root as Record<string, unknown>).type = "paragraph";
      if (
        ["node-version", "node-mode", "node-format", "long-text"].includes(
          reason,
        )
      )
        root.children = [
          {
            type: "text",
            version: reason === "node-version" ? 2 : 1,
            text: reason === "long-text" ? "x".repeat(16001) : "Текст",
            mode: reason === "node-mode" ? "token" : "normal",
            format: reason === "node-format" ? -1 : 0,
          },
        ];
      if (reason === "heading-tag")
        root.children = [
          { type: "heading", version: 1, tag: "h7", children: [] },
        ];
      if (reason === "list-tag" || reason === "list-start")
        root.children = [
          {
            type: "list",
            version: 1,
            listType: "number",
            tag: reason === "list-tag" ? "div" : "ol",
            start: reason === "list-start" ? -1 : 1,
            children: [],
          },
        ];
      if (reason === "list-item-checked")
        root.children = [
          { type: "listitem", version: 1, checked: "yes", children: [] },
        ];
      if (reason === "deep-text") {
        let node: Record<string, unknown> = {
          type: "text",
          version: 1,
          text: "Конец",
        };
        for (let index = 0; index < 25; index++)
          node = { type: "paragraph", version: 1, children: [node] };
        root.children = [node];
      }
      expect(failures(await f.check()).length).toBeGreaterThan(0);
      expect(f.find).not.toHaveBeenCalled();
      expect(f.findByID).not.toHaveBeenCalled();
    },
  );

  it("проверяет форматированный статический текст без изменения документа и подготовки render projection", async () => {
    const f = fixture();
    heroText(f.page).children = [
      {
        type: "heading",
        version: 1,
        tag: "h2",
        children: [{ type: "text", version: 1, text: "Доставка", format: 3 }],
      },
      {
        type: "list",
        version: 1,
        tag: "ol",
        listType: "number",
        start: 1,
        children: [
          {
            type: "listitem",
            version: 1,
            value: 1,
            checked: false,
            children: [{ type: "text", version: 1, text: "Завтра", format: 1 }],
          },
        ],
      },
    ];
    const before = structuredClone(f.page);
    const result = await f.check();
    expect(failures(result)).toEqual([]);
    expect(f.page).toEqual(before);
    expect(Object.keys(result).sort()).toEqual(["checks", "policyHash"]);
    expect(f.find).not.toHaveBeenCalled();
    expect(f.findByID).not.toHaveBeenCalled();
  });
});

describe("Post-commit обновление витрины Pages", () => {
  it("обновляет old/new/home один раз даже при disableRevalidate в request context", async () => {
    const f = fixture();
    await pagePublicationAdapter.revalidate(
      ["delivery", "home", "contacts", "delivery"],
      f.req,
    );
    expect(revalidatePath.mock.calls).toEqual([
      ["/delivery"],
      ["/"],
      ["/contacts"],
    ]);
  });
  it("не выполняет частичное обновление для незавершённой транзакции или неверного второго пути", async () => {
    const f = fixture();
    f.req.transactionID = Promise.resolve(25);
    await expect(
      pagePublicationAdapter.revalidate(["delivery"], f.req),
    ).rejects.toThrow();
    delete f.req.transactionID;
    await expect(
      pagePublicationAdapter.revalidate(["delivery", "../admin"], f.req),
    ).rejects.toThrow();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("передаёт ошибку Next delivery owner для отдельного повтора доставки", async () => {
    const f = fixture();
    revalidatePath.mockImplementation(() => {
      throw new Error("Cache is unavailable");
    });
    await expect(
      pagePublicationAdapter.revalidate(["delivery"], f.req),
    ).rejects.toThrow("Cache is unavailable");
  });
});
