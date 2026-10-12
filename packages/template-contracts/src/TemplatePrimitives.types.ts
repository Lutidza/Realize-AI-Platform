/**
 * @file packages/template-contracts/src/TemplatePrimitives.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Задаёт native API заменяемых примитивов template-пакета.
 */

import type { ComponentProps, ComponentType } from "react";

/** Сохраняет native props/ref; disabledAppearance не отменяет нативный disabled. */
export type TemplateButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "icon" | "small";
  disabledAppearance?: "muted" | "preserved";
};

/** Сохраняет native events/ref и связи aria-describedby/labels без преобразования. */
export type TemplateInputProps = ComponentProps<"input">;

/** Разрешённый полный adapter; наследование default объявлено отдельно в manifest. */
export type TemplateUiAdapter = {
  readonly Button: ComponentType<TemplateButtonProps>;
  readonly Input: ComponentType<TemplateInputProps>;
};
