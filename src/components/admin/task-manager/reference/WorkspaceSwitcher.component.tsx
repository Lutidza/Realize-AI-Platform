/**
 * @file src/components/admin/task-manager/reference/WorkspaceSwitcher.component.tsx
 * @version 1.3.1
 * @date 2026-10-12
 * @description Переключает активную среду и открывает каталог, создание и её настройки.
 * @see documentation/architecture/system-admin-shell.md
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, LayoutGrid, Plus, Settings2 } from "lucide-react";
import { UiButton, UiSearchInput } from "@realize/ui-kit";
import {
  SystemAdminMenuContent,
  SystemAdminDisclosureIcon,
} from "@realize/template-realize/ui";
import { workspaceIcons } from "./taskWorkspace.constants";
import { useWorkspaceSwitcher } from "./useWorkspaceSwitcher.hook";
import { taskWorkbenchMessages } from "./taskWorkbench.messages";
import type { WorkspaceSwitcherProps } from "./WorkspaceViews.types";
import styles from "./Workspace.module.css";

export function WorkspaceSwitcher({
  state,
  workspace,
  onSelect,
  onCreate,
  onCatalog,
  onSettings,
  variant = "navigation",
  locale = "ru",
}: WorkspaceSwitcherProps) {
  const t = taskWorkbenchMessages[locale];
  const picker = useWorkspaceSwitcher(state);
  const { searchRef, listRef, triggerRef } = picker;
  const Icon = workspaceIcons[workspace?.icon ?? "layers"];
  return (
    <div
      className={styles.switcher}
      data-state={picker.open ? "open" : "closed"}
      data-variant={variant}
    >
      <DropdownMenu.Root
        modal={false}
        open={picker.open}
        onOpenChange={picker.setOpen}
      >
        <DropdownMenu.Trigger asChild>
          <UiButton
            ref={triggerRef}
            variant="ghost"
            className={styles.switcherTrigger}
            aria-label={t.chooseWorkspace}
          >
            <span
              className={styles.switcherAvatar}
              data-color={workspace?.color ?? "purple"}
            >
              <Icon size={17} aria-hidden="true" />
            </span>
            <span className={styles.switcherText}>
              <strong title={workspace?.name}>
                {workspace?.name ?? t.chooseWorkspace}
              </strong>
              <small>
                {t.kinds.workspace}
                {workspace?.archived ? ` · ${t.archiveBadge}` : ""}
              </small>
            </span>
            <SystemAdminDisclosureIcon size={14} expanded={picker.open} />
          </UiButton>
        </DropdownMenu.Trigger>
        <SystemAdminMenuContent
          className={styles.switcherMenu}
          aria-label={t.workspaceSelection}
          align="start"
          loop
          onCloseAutoFocus={picker.onCloseAutoFocus}
        >
          <div className={styles.switcherBody}>
            <div className={styles.switcherSearch}>
              <UiSearchInput
                ref={searchRef}
                aria-label={t.searchWorkspace}
                placeholder={t.findWorkspace}
                value={picker.query}
                onChange={(event) => picker.setQuery(event.target.value)}
                onKeyDown={picker.onSearchKeyDown}
              />
            </div>
            <div
              className={styles.switcherList}
              data-navigation-scroll
              ref={listRef}
            >
              {picker.workspaces.map((entry) => {
                const ItemIcon = workspaceIcons[entry.icon];
                return (
                  <DropdownMenu.Item
                    data-workspace-choice={entry.id}
                    className={styles.switcherItem}
                    key={entry.id}
                    title={entry.name}
                    onSelect={() => picker.select(() => onSelect(entry.id))}
                  >
                    <ItemIcon size={16} aria-hidden="true" />
                    <span>{entry.name}</span>
                    {workspace?.id === entry.id ? (
                      <Check size={15} aria-hidden="true" />
                    ) : null}
                  </DropdownMenu.Item>
                );
              })}
              {!picker.workspaces.length ? (
                <p className={styles.smallEmpty}>{t.noWorkspaces}</p>
              ) : null}
            </div>
            {picker.hasMore && (
              <DropdownMenu.Item
                className={styles.showMore}
                onSelect={(event) => {
                  event.preventDefault();
                  picker.showMore();
                }}
              >
                {t.showMore} <span>+{picker.nextPageSize}</span>
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Separator className={styles.menuSeparator} />
            <DropdownMenu.Item
              className={styles.switcherItem}
              onSelect={() => picker.select(onCatalog)}
            >
              <LayoutGrid size={16} aria-hidden="true" />
              {t.allWorkspaces}
            </DropdownMenu.Item>
            {variant === "toolbar" && workspace && (
              <DropdownMenu.Item
                className={styles.switcherItem}
                onSelect={() => picker.select(onSettings)}
              >
                <Settings2 size={16} aria-hidden="true" />
                {t.workspaceSettings}
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item
              className={styles.switcherItem}
              onSelect={() => picker.select(onCreate)}
            >
              <Plus size={16} aria-hidden="true" />
              {t.createWorkspace}
            </DropdownMenu.Item>
          </div>
        </SystemAdminMenuContent>
      </DropdownMenu.Root>
      {workspace && variant === "navigation" ? (
        <UiButton
          variant="ghost"
          size="icon"
          className={styles.switcherSettings}
          aria-label={t.workspaceSettings}
          title={t.workspaceSettings}
          onClick={onSettings}
        >
          <Settings2 size={16} aria-hidden="true" />
        </UiButton>
      ) : null}
    </div>
  );
}
