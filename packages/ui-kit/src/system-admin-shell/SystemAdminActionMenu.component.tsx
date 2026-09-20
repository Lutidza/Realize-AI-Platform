/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminActionMenu.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Собирает общее меню действий с согласованными поверхностью, стрелкой и фокусом.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { UiButton } from "../button/UiButton.component";
import { SystemAdminMenuContent } from "./SystemAdminMenuContent.component";
import { useSystemAdminActionMenu } from "./useSystemAdminActionMenu.hook";
import type { SystemAdminActionMenuProps } from "./SystemAdminToolbar.types";
import menuStyles from "./SystemAdminFavorites.module.css";
import styles from "./SystemAdminToolbar.module.css";

export function SystemAdminActionMenu({
  label,
  trigger,
  actions,
  heading,
  className,
  align = "end",
}: SystemAdminActionMenuProps) {
  const menu = useSystemAdminActionMenu();
  const { triggerRef } = menu;
  return (
    <DropdownMenu.Root
      modal={false}
      open={menu.open}
      onOpenChange={menu.setOpen}
    >
      <DropdownMenu.Trigger asChild>
        <UiButton
          ref={triggerRef}
          variant="ghost"
          size="icon"
          className={className}
          aria-label={label}
          title={label}
        >
          {trigger}
        </UiButton>
      </DropdownMenu.Trigger>
      <SystemAdminMenuContent
        className={menuStyles.menu}
        aria-label={label}
        align={align}
        onCloseAutoFocus={menu.onCloseAutoFocus}
        loop
      >
        <div className={menuStyles.menuBody}>
          {heading && (
            <DropdownMenu.Label className={styles.menuHeading}>
              {heading}
            </DropdownMenu.Label>
          )}
          {actions.map((action) => (
            <DropdownMenu.Item
              key={action.id}
              className={menuStyles.menuItem}
              disabled={action.disabled}
              onSelect={() => menu.select(action.onSelect)}
            >
              {action.icon}
              <span>{action.label}</span>
            </DropdownMenu.Item>
          ))}
        </div>
      </SystemAdminMenuContent>
    </DropdownMenu.Root>
  );
}
