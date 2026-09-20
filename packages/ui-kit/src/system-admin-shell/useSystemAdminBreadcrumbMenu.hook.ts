/**
 * @file packages/ui-kit/src/system-admin-shell/useSystemAdminBreadcrumbMenu.hook.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Фильтрует соседние записи и соединяет поиск с клавиатурой общего меню.
 * @see documentation/architecture/system-admin-shell.md
 */
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSystemAdminActionMenu } from "./useSystemAdminActionMenu.hook";
import type { SystemAdminBreadcrumbMenuProps } from "./SystemAdminBreadcrumbs.types";

export function useSystemAdminBreadcrumbMenu({
  item,
  locale,
}: SystemAdminBreadcrumbMenuProps) {
  const menu = useSystemAdminActionMenu();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!menu.open) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [menu.open]);
  return {
    ...menu,
    searchRef,
    query,
    setQuery,
    choices: (item.choices ?? []).filter((choice) =>
      choice.label
        .toLocaleLowerCase(locale)
        .includes(query.trim().toLocaleLowerCase(locale)),
    ),
    setOpen: (open: boolean) => {
      menu.setOpen(open);
      if (!open) setQuery("");
    },
    onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") return;
      event.stopPropagation();
      if (
        ["ArrowDown", "Enter", "Tab"].includes(event.key) &&
        !event.shiftKey
      ) {
        event.preventDefault();
        const first = event.currentTarget
          .closest('[role="menu"]')
          ?.querySelector<HTMLElement>(
            "[data-breadcrumb-choice]:not([data-disabled])",
          );
        if (event.key === "Enter") first?.click();
        else first?.focus();
      }
    },
  };
}
