/**
 * @file src/blocks/RenderBlocks.types.ts
 * @version 2.0.0
 * @date 2026-09-14
 * @description Данные типизированного отображения блоков страницы.
 */
import type { Page } from "@/payload-types";

export type RenderBlocksProps = {
  blocks: Page["layout"][0][];
};
