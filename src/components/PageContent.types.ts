/**
 * @file src/components/PageContent.types.ts
 * @version 2.0.0
 * @date 2026-09-14
 * @description Описывает данные отображения CMS-страницы.
 */
import type { Page } from "@/payload-types";

export type PageContentProps = {
  hero: Page["hero"];
  layout: Page["layout"];
};
