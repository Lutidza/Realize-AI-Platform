/**
 * @file tests/int/document-screen-container.int.spec.ts
 * @version 1.0.1
 * @date 2026-11-24
 * @description Проверяет общий внешний контейнер списка документов, создания и чтения статьи.
 * @see documentation/specifications/realize-ai-control-panel/shell/content-grid.md
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ControlPanelPreview } from "../../src/components/admin/control-panel-preview/ControlPanelPreview.component";
import { ArticleCreateForm } from "../../src/components/admin/documents/ArticleCreateForm.component";
import { DocumentListScreen } from "../../src/components/admin/documents/DocumentListScreen.component";
import { DocumentReadingScreen } from "../../src/components/admin/documents/DocumentReadingScreen.component";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock(
  "../../src/components/admin/documents/createDocumentArticle.action",
  () => ({
    createDocumentArticleAction: vi.fn(),
    checkCreatedDocumentArticleAction: vi.fn(),
  }),
);

it.each(["default", "without-topbar"] as const)(
  "использует полноширинные поверхности всех экранов документов в макете %s",
  (layoutId) => {
    const appearance = { layoutId, mode: "light" as const };
    const listPreview = {
      ...appearance,
      children: createElement(DocumentListScreen, {
        items: [],
        page: 1,
        totalPages: 1,
      }),
    };
    const create = createElement(ArticleCreateForm, {
      ...appearance,
      fromPage: 1,
    });
    const readingPreview = {
      ...appearance,
      children: createElement(DocumentReadingScreen, {
        title: "Статья",
        updatedAt: "2026-11-24T00:00:00Z",
        sections: [{ id: "first", title: "Раздел", paragraphs: ["Текст"] }],
      }),
    };

    for (const [screen, selector] of [
      [createElement(ControlPanelPreview, listPreview), "h1"],
      [create, "form"],
      [createElement(ControlPanelPreview, readingPreview), "article"],
    ] as const) {
      const template = document.createElement("template");
      template.innerHTML = renderToStaticMarkup(screen);
      const content = template.content.querySelector(
        '[data-panel-region="panel-content"]',
      );
      const outer = content
        ?.querySelector(selector)
        ?.closest("[data-ui-container]");
      expect(outer?.getAttribute("data-ui-container"), selector).toBe("fluid");
      if (selector === "article") {
        const paragraph = outer?.querySelector("article section p");
        expect(
          paragraph
            ?.closest("[data-ui-container]")
            ?.getAttribute("data-ui-container"),
        ).toBe("reading");
      }
    }
  },
);
