/**
 * @file packages/payload-ai-plugin/src/admin/ui/AdminMenu.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Соединяет native-trigger, portal и клавиатурное управление Payload с UI-китом.
 */

"use client";
import { Popup } from "@payloadcms/ui";
import { getUiButtonClassName, UiSurface } from "@realize/ui-kit";
import { AdminUiTheme } from "../AdminUiTheme.component";
import type { AdminMenuProps } from "./AdminMenu.types";
import styles from "./AdminMenu.module.css";

export const AdminMenu = ({
  label,
  icon,
  disabled,
  align = "right",
  placement = "bottom",
  children,
  wide,
}: AdminMenuProps) => (
  <Popup
    button={
      <span aria-label={label} title={label}>
        {icon}
      </span>
    }
    buttonClassName={getUiButtonClassName({ variant: "ghost", size: "icon" })}
    buttonType="default"
    disabled={disabled}
    noBackground
    caret={false}
    horizontalAlign={align}
    verticalAlign={placement}
    size="fit-content"
    showScrollbar
    portalClassName={styles.portal}
    render={() => (
      <AdminUiTheme>
        <UiSurface
          className={wide ? styles.wide : styles.menu}
          role="group"
          aria-label={label}
        >
          {children}
        </UiSurface>
      </AdminUiTheme>
    )}
  />
);
