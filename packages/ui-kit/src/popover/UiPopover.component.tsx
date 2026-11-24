/**
 * @file packages/ui-kit/src/popover/UiPopover.component.tsx
 * @version 1.0.1
 * @date 2026-11-12
 * @description Отображает общий popover с порталом, темой и возвратом фокуса.
 * @see documentation/architecture/ui-kit.md
 */
"use client";
import { FloatingFocusManager, FloatingPortal } from "@floating-ui/react";
import { X } from "lucide-react";
import { UiTheme } from "../theme/UiTheme.component";
import { UiButton } from "../button/UiButton.component";
import { UI_FLOATING_CONTAINER_CONTEXT } from "../floating-layer/uiFloatingContainer.constants";
import { UI_FLOATING_GEOMETRY as geometry } from "../floating-layer/uiFloatingGeometry.constants";
import { useUiPopover } from "./useUiPopover.hook";
import type { UiPopoverProps } from "./UiPopover.types";
import styles from "./UiPopover.module.css";

/** Геометрия trigger не зависит от содержимого; pointer/focus dismiss ограничены текущим слоем. */
export function UiPopover({
  open,
  onOpenChange,
  mode,
  title,
  children,
  renderTrigger,
}: UiPopoverProps) {
  const {
    setArrowElement,
    arrowStyles,
    titleId,
    setFloating,
    floatingStyles,
    context,
    floatingElement,
    triggerProps,
    floatingProps,
  } = useUiPopover({ open, onOpenChange });
  return (
    <>
      {renderTrigger({
        ...triggerProps,
        className: [triggerProps.className, styles.trigger]
          .filter(Boolean)
          .join(" "),
      })}
      {open && (
        <FloatingPortal>
          <UiTheme baseline mode={mode} className={styles.portal}>
            <FloatingFocusManager context={context} modal={false} returnFocus>
              <div
                ref={setFloating}
                style={floatingStyles}
                {...floatingProps}
                aria-labelledby={titleId}
                className={styles.content}
                data-ui="popover"
              >
                <svg
                  ref={setArrowElement}
                  width={geometry.arrowWidth}
                  height={geometry.arrowHeight}
                  viewBox="0 0 20 12"
                  aria-hidden="true"
                  className={styles.arrow}
                  style={arrowStyles}
                  data-ui="popover-arrow"
                >
                  <path d="M0 0 10 12 20 0" />
                </svg>
                <div className={styles.scrollBody}>
                  <div className={styles.header}>
                    <h2 id={titleId}>{title}</h2>
                    <UiButton
                      variant="ghost"
                      size="icon"
                      className={styles.close}
                      aria-label="Закрыть панель"
                      onClick={() => onOpenChange(false)}
                    >
                      <X size={16} aria-hidden="true" />
                    </UiButton>
                  </div>
                  <UI_FLOATING_CONTAINER_CONTEXT.Provider
                    value={floatingElement}
                  >
                    <div className={styles.body}>{children}</div>
                  </UI_FLOATING_CONTAINER_CONTEXT.Provider>
                </div>
              </div>
            </FloatingFocusManager>
          </UiTheme>
        </FloatingPortal>
      )}
    </>
  );
}
