/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminItemMenu.component.tsx
 * @version 1.2.1
 * @date 2026-10-12
 * @description Открывает компактное меню действий навигации по кнопке с тремя точками.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Copy, Ellipsis, ExternalLink, Star, StarOff } from "lucide-react";
import { UiButton } from "@realize/ui-kit";
import { SystemAdminMenuContent } from "./SystemAdminMenuContent.component";
import type { SystemAdminItemMenuProps } from "./systemAdminFavorites.types";
import { useSystemAdminItemMenu } from "./useSystemAdminItemMenu.hook";
import styles from "./SystemAdminFavorites.module.css";

/** Content остаётся внутри темы и focus scope панели; fixed Popper учитывает границы viewport. */
export function SystemAdminItemMenu({
  favoriteId = "",
  label,
  href,
  actions = [],
  triggerIcon,
  triggerLabel,
  alwaysVisible,
  side = "right",
  align = "start",
}: SystemAdminItemMenuProps) {
  const {
    open,
    setOpen,
    triggerRef,
    selected,
    available,
    canFavorite,
    linkHref,
    copying,
    copyNotice,
    copyLink,
    chooseFavorite,
    chooseAction,
    onCloseAutoFocus,
  } = useSystemAdminItemMenu(favoriteId, href);
  if (!available && !actions.length) return null;
  const title = triggerLabel ?? `Действия: ${label}`;
  const Icon = selected ? StarOff : Star;
  return (
    <DropdownMenu.Root modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <UiButton
          ref={triggerRef}
          variant="ghost"
          size="icon"
          className={styles.toggle}
          data-navigation-item-menu-trigger={favoriteId}
          data-always-visible={alwaysVisible || undefined}
          aria-label={title}
          title={title}
        >
          {triggerIcon ?? <Ellipsis size={17} aria-hidden="true" />}
        </UiButton>
      </DropdownMenu.Trigger>
      <SystemAdminMenuContent
        className={styles.menu}
        data-navigation-item-menu
        aria-label={title}
        side={side}
        align={align}
        onCloseAutoFocus={onCloseAutoFocus}
        loop
      >
        <div className={styles.menuBody} data-navigation-scroll>
          {actions
            .filter((action) => !action.danger)
            .map((action) => (
              <DropdownMenu.Item
                key={action.id}
                className={styles.menuItem}
                disabled={action.disabled}
                onSelect={() => chooseAction(action)}
              >
                {action.icon}
                {action.label}
              </DropdownMenu.Item>
            ))}
          {actions.some((action) => !action.danger) && available && (
            <DropdownMenu.Separator className={styles.menuSeparator} />
          )}
          {canFavorite && (
            <DropdownMenu.Item
              className={styles.menuItem}
              onSelect={chooseFavorite}
            >
              <Icon size={16} aria-hidden="true" />
              {selected ? "Убрать из избранного" : "Добавить в избранное"}
            </DropdownMenu.Item>
          )}
          {linkHref && (
            <>
              <DropdownMenu.Item className={styles.menuItem} asChild>
                <a href={linkHref} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} aria-hidden="true" />
                  Открыть в новой вкладке
                </a>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={styles.menuItem}
                disabled={copying}
                onSelect={(event) => {
                  event.preventDefault();
                  void copyLink();
                }}
              >
                <Copy size={16} aria-hidden="true" />
                Копировать ссылку
              </DropdownMenu.Item>
            </>
          )}
          {copyNotice.text && (
            <p
              className={styles.menuStatus}
              role="status"
              data-error={copyNotice.error}
            >
              {copyNotice.text}
            </p>
          )}
          {actions.some((action) => action.danger) && (
            <DropdownMenu.Separator className={styles.menuSeparator} />
          )}
          {actions
            .filter((action) => action.danger)
            .map((action) => (
              <DropdownMenu.Item
                key={action.id}
                className={styles.menuItem}
                data-danger
                disabled={action.disabled}
                onSelect={() => chooseAction(action)}
              >
                {action.icon}
                {action.label}
              </DropdownMenu.Item>
            ))}
        </div>
      </SystemAdminMenuContent>
    </DropdownMenu.Root>
  );
}
