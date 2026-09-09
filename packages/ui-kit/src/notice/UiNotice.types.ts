/**
 * @file packages/ui-kit/src/notice/UiNotice.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет сообщение UI-кита с семантическим тоном и необязательным заголовком.
 */

import type { ComponentProps, ReactNode } from "react";

/** title отображается внутри сообщения; role и aria-live задаёт потребитель. */
export type UiNoticeProps = Omit<ComponentProps<"div">, "title"> & {
  tone?: "neutral" | "positive" | "danger";
  title?: ReactNode;
  icon?: ReactNode;
};
