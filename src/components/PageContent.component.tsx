/**
 * @file src/components/PageContent.component.tsx
 * @version 2.0.0
 * @date 2026-09-14
 * @description Отображает первый экран и блоки обычной CMS-страницы витрины.
 */
import { RenderBlocks } from "@/blocks/RenderBlocks";
import { RenderHero } from "@/heros/RenderHero";
import type { PageContentProps } from "./PageContent.types";

/** Страница и штатный Live Preview Payload используют одно отображение. */
export const PageContent = ({ hero, layout }: PageContentProps) => (
  <article className="pt-16 pb-24">
    <RenderHero {...hero} />
    <RenderBlocks blocks={layout} />
  </article>
);
