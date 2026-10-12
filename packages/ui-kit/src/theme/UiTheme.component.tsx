/**
 * @file packages/ui-kit/src/theme/UiTheme.component.tsx
 * @version 1.2.0
 * @date 2026-10-12
 * @description Применяет выбранную palette и settings в DOM и наследующих React portals.
 */
"use client";

import type { UiThemeProps } from "./UiTheme.types";
import styles from "./UiTheme.module.css";
import { useUiTemplateRuntime } from "../template-runtime/useUiTemplateRuntime.hook";

/** Ограничивает тему поддеревом; не меняет глобальные стили приложения. */
export function UiTheme({
  className = "",
  mode,
  baseline = false,
  style,
  ...props
}: UiThemeProps) {
  const runtime = useUiTemplateRuntime();
  return (
    <div
      {...props}
      className={[
        styles.theme,
        baseline ? styles.baseline : "",
        runtime?.palette.className,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...runtime?.style, ...style }}
      data-ui-theme={mode}
      data-ui-template={runtime?.templateId}
      data-ui-template-version={runtime?.templateVersion}
      data-ui-palette={runtime?.palette.id}
      data-ui-palette-version={runtime?.palette.version}
    />
  );
}
