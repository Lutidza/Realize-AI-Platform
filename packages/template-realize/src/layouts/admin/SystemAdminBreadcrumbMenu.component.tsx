/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminBreadcrumbMenu.component.tsx
 * @version 1.0.1
 * @date 2026-10-12
 * @description Показывает поиск по соседним объектам уровня, текущий выбор и действия контейнера.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { UiButton, UiSearchInput } from "@realize/ui-kit";
import { SystemAdminMenuContent } from "./SystemAdminMenuContent.component";
import { SystemAdminDisclosureIcon } from "./SystemAdminDisclosureIcon.component";
import { useSystemAdminBreadcrumbMenu } from "./useSystemAdminBreadcrumbMenu.hook";
import { systemAdminMessages } from "./systemAdminLocale.messages";
import type { SystemAdminBreadcrumbMenuProps } from "./SystemAdminBreadcrumbs.types";
import menuStyles from "./SystemAdminFavorites.module.css";
import styles from "./SystemAdminBreadcrumbs.module.css";

export function SystemAdminBreadcrumbMenu(
  props: SystemAdminBreadcrumbMenuProps,
) {
  const { item, current, locale, asHeading = false } = props;
  const t = systemAdminMessages[locale];
  const menu = useSystemAdminBreadcrumbMenu(props);
  const { triggerRef, searchRef } = menu;
  const trigger = (
    <DropdownMenu.Trigger asChild>
      <UiButton
        ref={triggerRef}
        variant="ghost"
        size="small"
        className={`${styles.link} ${styles.levelTrigger}`}
        aria-label={`${t.switchLevel}: ${item.label}`}
        aria-current={current ? "page" : undefined}
        title={item.label}
      >
        {item.icon}
        <span className={styles.text}>{item.label}</span>
        <SystemAdminDisclosureIcon size={12} expanded={menu.open} />
      </UiButton>
    </DropdownMenu.Trigger>
  );
  return (
    <DropdownMenu.Root
      modal={false}
      open={menu.open}
      onOpenChange={menu.setOpen}
    >
      {asHeading ? (
        <h1 className={styles.currentTitle} aria-label={item.label}>
          {trigger}
        </h1>
      ) : (
        trigger
      )}
      <SystemAdminMenuContent
        className={`${menuStyles.menu} ${styles.levelMenu}`}
        align="start"
        onCloseAutoFocus={menu.onCloseAutoFocus}
        loop
      >
        <div className={menuStyles.menuBody}>
          {item.parentLabel && (
            <DropdownMenu.Label className={styles.parentLabel}>
              {item.parentLabel}
            </DropdownMenu.Label>
          )}
          <div className={styles.menuSearch}>
            <UiSearchInput
              ref={searchRef}
              placeholder={t.searchLevel}
              aria-label={t.searchLevel}
              value={menu.query}
              onChange={(event) => menu.setQuery(event.target.value)}
              onKeyDown={menu.onSearchKeyDown}
            />
          </div>
          {menu.choices.map((choice) => (
            <DropdownMenu.Item
              key={choice.id}
              className={`${menuStyles.menuItem} ${styles.choice}`}
              data-breadcrumb-choice={choice.id}
              data-current={choice.id === item.id}
              aria-current={choice.id === item.id ? "page" : undefined}
              disabled={choice.disabled}
              onSelect={() => menu.select(choice.onSelect)}
              title={choice.label}
            >
              {choice.icon}
              <span className={styles.text}>{choice.label}</span>
              {choice.id === item.id && (
                <Check
                  className={styles.selectedIcon}
                  size={15}
                  aria-hidden="true"
                />
              )}
            </DropdownMenu.Item>
          ))}
          {!menu.choices.length && (
            <p className={styles.empty} role="status">
              {t.noMatches}
            </p>
          )}
          {Boolean(item.actions?.length) && (
            <DropdownMenu.Separator className={menuStyles.menuSeparator} />
          )}
          {item.actions?.map((action) => (
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
