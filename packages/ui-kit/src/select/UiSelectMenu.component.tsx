/**
 * @file packages/ui-kit/src/select/UiSelectMenu.component.tsx
 * @version 1.0.1
 * @date 2026-11-12
 * @description Отображает общий кастомный Select с клавиатурой и темой портала.
 * @see documentation/architecture/ui-kit.md
 */
"use client";
import { useContext } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { UiTheme } from "../theme/UiTheme.component";
import { UI_FLOATING_CONTAINER_CONTEXT } from "../floating-layer/uiFloatingContainer.constants";
import { UI_FLOATING_GEOMETRY as geometry } from "../floating-layer/uiFloatingGeometry.constants";
import type { UiSelectMenuProps } from "./UiSelectMenu.types";
import inputStyles from "../input/UiInput.module.css";
import styles from "./UiSelectMenu.module.css";

/** Вложенный portal остаётся внутри родительской панели; Escape закрывает только верхний слой. */
export function UiSelectMenu({
  id,
  label,
  value,
  onValueChange,
  options,
  mode,
  disabled,
  placeholder,
}: UiSelectMenuProps) {
  const container = useContext(UI_FLOATING_CONTAINER_CONTEXT);
  return (
    <Select.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <Select.Trigger
        id={id}
        aria-label={label}
        className={[inputStyles.input, styles.trigger].join(" ")}
        data-ui="select-menu"
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon asChild>
          <ChevronDown size={16} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal container={container ?? undefined}>
        <UiTheme baseline mode={mode} className={styles.portal}>
          <Select.Content
            className={styles.content}
            position="popper"
            sideOffset={geometry.gap}
            collisionPadding={geometry.collisionPadding}
            onEscapeKeyDown={(event) => event.stopPropagation()}
            data-ui="select-menu-popup"
          >
            <Select.ScrollUpButton className={styles.scroll}>
              <ChevronUp size={16} />
            </Select.ScrollUpButton>
            <Select.Viewport
              className={styles.viewport}
              data-ui="select-menu-viewport"
            >
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={styles.item}
                  data-ui="select-menu-item"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className={styles.indicator}>
                    <Check size={16} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className={styles.scroll}>
              <ChevronDown size={16} />
            </Select.ScrollDownButton>
          </Select.Content>
        </UiTheme>
      </Select.Portal>
    </Select.Root>
  );
}
