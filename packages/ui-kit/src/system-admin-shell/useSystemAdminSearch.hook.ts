/**
 * @file packages/ui-kit/src/system-admin-shell/useSystemAdminSearch.hook.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Управляет клавиатурной палитрой, фильтрацией host entries и передачей фокуса.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { SystemAdminSearchEntry } from "./SystemAdminToolbar.types";

export function useSystemAdminSearch(entries: SystemAdminSearchEntry[]) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<(() => void) | null>(null);
  const listId = useId();
  const words = query
    .trim()
    .toLocaleLowerCase("ru")
    .split(/\s+/)
    .filter(Boolean);
  const results = entries
    .filter(
      (entry) =>
        !entry.disabled &&
        words.every((word) =>
          `${entry.label} ${entry.description ?? ""} ${entry.keywords ?? ""} ${entry.group}`
            .toLocaleLowerCase("ru")
            .includes(word),
        ),
    )
    .slice(0, 40);
  const activeIndex = Math.min(index, results.length - 1);
  const activeId = activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined;
  const changeOpen = (next: boolean) => {
    setOpen(next);
    setQuery("");
    setIndex(0);
  };
  const select = (entry: SystemAdminSearchEntry) => {
    pending.current = entry.onSelect;
    setOpen(false);
  };
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k"
      )
        return;
      if (
        !open &&
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
        )
      )
        return;
      event.preventDefault();
      setOpen(!open);
      setQuery("");
      setIndex(0);
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [open]);
  useEffect(() => {
    if (open && activeId)
      document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeId]);
  return {
    open,
    query,
    inputRef,
    triggerRef,
    listId,
    results,
    activeIndex,
    activeId,
    setOpen: changeOpen,
    setQuery: (value: string) => {
      setQuery(value);
      setIndex(0);
    },
    select,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (results.length)
          setIndex(
            (activeIndex +
              (event.key === "ArrowDown" ? 1 : -1) +
              results.length) %
              results.length,
          );
      } else if (event.key === "Enter" && results[activeIndex]) {
        event.preventDefault();
        select(results[activeIndex]);
      }
    },
    onCloseAutoFocus: (event: Event) => {
      const action = pending.current;
      pending.current = null;
      if (!action) return;
      event.preventDefault();
      requestAnimationFrame(() => {
        triggerRef.current?.focus({ preventScroll: true });
        action();
      });
    },
  };
}
