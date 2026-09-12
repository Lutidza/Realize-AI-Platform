/**
 * @file packages/ui-kit/src/resize-handle/UiResizeHandle.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Задаёт доступное имя, размер и обработчики вертикального края панели.
 */

import type { ComponentProps } from "react";

export type UiResizeHandleProps = ComponentProps<"div"> & {
  label: string;
  controls: string;
  value: number;
  min: number;
  max: number;
};
