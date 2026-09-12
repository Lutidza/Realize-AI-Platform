/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIView.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт серверные параметры страницы и отдельного окна чата.
 */

import type { AdminViewServerProps } from "payload";
export type RealizeAIViewProps = AdminViewServerProps & {
  presentation?: "page" | "window";
};
