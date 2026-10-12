/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminProfileMenu.component.tsx
 * @version 1.2.0
 * @date 2026-10-12
 * @description Собирает профиль, разрешённые host-действия и настройки интерфейса в общее меню.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Globe2, Keyboard, Moon, Sun } from "lucide-react";
import { UiButton } from "@realize/ui-kit";
import { SystemAdminMenuContent } from "./SystemAdminMenuContent.component";
import { SystemAdminShortcutHelp } from "./SystemAdminShortcutHelp.component";
import { useSystemAdminProfileMenu } from "./useSystemAdminProfileMenu.hook";
import {
  systemAdminLanguages,
  systemAdminMessages,
} from "./systemAdminLocale.messages";
import type { SystemAdminProfileMenuProps } from "./SystemAdminToolbar.types";
import menuStyles from "./SystemAdminFavorites.module.css";
import toolbarStyles from "./SystemAdminToolbar.module.css";
import styles from "./SystemAdminProfileMenu.module.css";

export function SystemAdminProfileMenu({
  user,
  profileActions,
  billingActions = [],
  signOutAction,
  theme,
  onThemeChange,
  locale = "ru",
  onLocaleChange,
}: SystemAdminProfileMenuProps) {
  const menu = useSystemAdminProfileMenu();
  const { triggerRef } = menu;
  const t = systemAdminMessages[locale];
  const groups = [
    { id: "account", label: t.account, actions: profileActions },
    { id: "billing", label: t.billing, actions: billingActions },
  ];
  return (
    <>
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
            className={toolbarStyles.iconButton}
            aria-label={`${t.profile}: ${user.name}`}
            title={t.profile}
          >
            <span className={toolbarStyles.avatar}>{user.initials}</span>
          </UiButton>
        </DropdownMenu.Trigger>
        <SystemAdminMenuContent
          className={`${menuStyles.menu} ${styles.menu}`}
          align="end"
          onCloseAutoFocus={menu.onCloseAutoFocus}
          loop
        >
          <div className={menuStyles.menuBody}>
            <DropdownMenu.Label className={styles.identity}>
              <span className={styles.avatar} aria-hidden="true">
                {user.initials}
              </span>
              <span className={styles.identityText}>
                <strong>{user.name}</strong>
                {user.description && <small>{user.description}</small>}
              </span>
            </DropdownMenu.Label>
            {groups
              .filter((group) => group.actions.length > 0)
              .map((group) => (
                <DropdownMenu.Group key={group.id}>
                  <DropdownMenu.Separator
                    className={menuStyles.menuSeparator}
                  />
                  <DropdownMenu.Label className={styles.sectionLabel}>
                    {group.label}
                  </DropdownMenu.Label>
                  {group.actions.map((action) => (
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
                </DropdownMenu.Group>
              ))}
            <DropdownMenu.Separator className={menuStyles.menuSeparator} />
            <div className={styles.preferences}>
              <DropdownMenu.Item
                className={styles.choice}
                onSelect={menu.openShortcuts}
                aria-label={t.shortcuts}
                title={t.shortcuts}
              >
                <Keyboard size={17} aria-hidden="true" />
              </DropdownMenu.Item>
              {onThemeChange && (
                <DropdownMenu.RadioGroup
                  className={styles.preference}
                  value={theme}
                  onValueChange={(value) =>
                    onThemeChange(value === "dark" ? "dark" : "light")
                  }
                  aria-label={t.theme}
                >
                  {(["light", "dark"] as const).map((value) => (
                    <DropdownMenu.RadioItem
                      key={value}
                      value={value}
                      className={styles.choice}
                      onSelect={(event) => event.preventDefault()}
                      aria-label={t[value]}
                      title={`${t.theme}: ${t[value]}`}
                    >
                      {value === "light" ? (
                        <Sun size={15} aria-hidden="true" />
                      ) : (
                        <Moon size={15} aria-hidden="true" />
                      )}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              )}
              {onLocaleChange && (
                <DropdownMenu.Item
                  className={styles.choice}
                  aria-label={t.language}
                  title={t.language}
                  aria-expanded={menu.languagesOpen}
                  aria-controls={menu.languagesId}
                  onSelect={(event) => {
                    event.preventDefault();
                    menu.toggleLanguages();
                  }}
                >
                  <Globe2 size={17} aria-hidden="true" />
                  <span className={styles.locale}>{locale.toUpperCase()}</span>
                </DropdownMenu.Item>
              )}
            </div>
            {onLocaleChange && menu.languagesOpen && (
              <DropdownMenu.RadioGroup
                id={menu.languagesId}
                className={styles.languages}
                value={locale}
                aria-label={t.language}
                onValueChange={(value) =>
                  onLocaleChange(value === "en" ? "en" : "ru")
                }
              >
                {systemAdminLanguages.map((language) => (
                  <DropdownMenu.RadioItem
                    key={language.value}
                    value={language.value}
                    className={menuStyles.menuItem}
                    aria-label={language.label}
                    title={language.label}
                    onSelect={(event) => event.preventDefault()}
                  >
                    <DropdownMenu.ItemIndicator
                      forceMount
                      className={styles.check}
                    >
                      <Check size={13} aria-hidden="true" />
                    </DropdownMenu.ItemIndicator>
                    <span lang={language.value}>{language.label}</span>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            )}
            {signOutAction && (
              <>
                <DropdownMenu.Separator className={menuStyles.menuSeparator} />
                <DropdownMenu.Item
                  className={menuStyles.menuItem}
                  data-danger
                  disabled={signOutAction.disabled}
                  onSelect={() => menu.select(signOutAction.onSelect)}
                >
                  {signOutAction.icon}
                  <span>{signOutAction.label}</span>
                </DropdownMenu.Item>
              </>
            )}
          </div>
        </SystemAdminMenuContent>
      </DropdownMenu.Root>
      <SystemAdminShortcutHelp
        open={menu.shortcutsOpen}
        onOpenChange={menu.setShortcutsOpen}
        theme={theme}
        locale={locale}
      />
    </>
  );
}
