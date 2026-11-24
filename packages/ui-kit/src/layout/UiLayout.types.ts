/**
 * @file packages/ui-kit/src/layout/UiLayout.types.ts
 * @version 1.0.0
 * @date 2026-11-12
 * @description Определяет контейнеры и адаптивные spans общей сетки содержимого.
 * @see documentation/architecture/ui-kit.md
 */
import type { ComponentPropsWithRef, CSSProperties } from "react";

export type UiContainerVariant = "fluid" | "contained" | "reading";
export type UiContainerProps = ComponentPropsWithRef<"div"> & {
  /** Ограничивает ширину экрана; не добавляет отступы поверх shell. */
  variant?: UiContainerVariant;
};

/** Локальные gutters задаются CSS-длинами или ссылками на общие space tokens. */
export type UiGridStyle = CSSProperties & {
  "--ui-grid-column-gap"?: string;
  "--ui-grid-row-gap"?: string;
};
export type UiGridProps = Omit<ComponentPropsWithRef<"div">, "style"> & {
  style?: UiGridStyle;
};
export type UiGridSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
/** md/lg относятся к ширине ближайшего UiGrid, а не окна браузера. */
export type UiGridResponsiveSpan = {
  base?: UiGridSpan;
  md?: UiGridSpan;
  lg?: UiGridSpan;
};
export type UiGridItemProps = ComponentPropsWithRef<"div"> & {
  span?: UiGridSpan | UiGridResponsiveSpan;
};

/** Внутренние переменные каждого item сбрасываются, исключая наследование из внешнего item. */
export type UiGridItemStyle = CSSProperties & {
  "--ui-grid-span-base": UiGridSpan;
  "--ui-grid-span-md": UiGridSpan;
  "--ui-grid-span-lg": UiGridSpan;
};
