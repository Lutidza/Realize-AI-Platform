/**
 * @file src/components/admin/task-manager/reference/useWorkspaceSwitcher.hook.ts
 * @version 1.2.0
 * @date 2026-09-18
 * @description Фильтрует доступные активные среды и закрывает переключатель после выбора.
 * @see documentation/specifications/task-management.md
 */

import { useEffect, useRef, useState } from "react";
import { useSystemAdminActionMenu } from "@realize/ui-kit";
import type { KeyboardEvent } from "react";
import { getWorkspaceAccess } from "./taskWorkspace.access";
import type { PrototypeState } from "./taskManager.types";

const PAGE_SIZE = 10;

export function useWorkspaceSwitcher(state: PrototypeState) {
  const menu = useSystemAdminActionMenu();
  const { open, setOpen } = menu;
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusNextRef = useRef<string | null>(null);
  const matched = state.workspaces.filter(
    (entry) =>
      !entry.archived &&
      getWorkspaceAccess(state, entry).canRead &&
      entry.name
        .toLocaleLowerCase("ru")
        .includes(query.trim().toLocaleLowerCase("ru")),
  );
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const id = focusNextRef.current;
    if (!id) return;
    const item = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(
        "[data-workspace-choice]",
      ) ?? [],
    ).find((entry) => entry.dataset.workspaceChoice === id);
    item?.focus();
    focusNextRef.current = null;
  }, [limit]);
  return {
    triggerRef: menu.triggerRef,
    select: menu.select,
    onCloseAutoFocus: menu.onCloseAutoFocus,
    open,
    query,
    setQuery: (value: string) => {
      setQuery(value);
      setLimit(PAGE_SIZE);
      focusNextRef.current = null;
      if (listRef.current) listRef.current.scrollTop = 0;
    },
    searchRef,
    listRef,
    hasMore: matched.length > limit,
    remaining: Math.max(0, matched.length - limit),
    nextPageSize: Math.min(PAGE_SIZE, Math.max(0, matched.length - limit)),
    showMore: () => {
      focusNextRef.current = matched[limit]?.id ?? null;
      setLimit((value) => value + PAGE_SIZE);
    },
    onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") return;
      event.stopPropagation();
      if (
        event.key === "ArrowDown" ||
        event.key === "Tab" ||
        event.key === "Enter"
      ) {
        event.preventDefault();
        const first = event.currentTarget
          .closest('[role="menu"]')
          ?.querySelector<HTMLElement>(
            event.key === "Enter"
              ? "[data-workspace-choice]"
              : '[role="menuitem"]',
          );
        if (event.key === "Enter") first?.click();
        else first?.focus();
      }
    },
    setOpen: (next: boolean) => {
      setOpen(next);
      if (!next) {
        setQuery("");
        setLimit(PAGE_SIZE);
        focusNextRef.current = null;
      }
    },
    workspaces: matched.slice(0, limit),
  };
}
