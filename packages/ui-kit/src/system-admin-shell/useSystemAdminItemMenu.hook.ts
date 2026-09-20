/**
 * @file packages/ui-kit/src/system-admin-shell/useSystemAdminItemMenu.hook.ts
 * @version 1.2.0
 * @date 2026-09-18
 * @description Согласует избранное, копирование адреса и возврат фокуса меню пункта.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import { useRef, useState } from "react";
import { useSystemAdminFavorites } from "./useSystemAdminFavorites.hook";
import type { SystemAdminItemMenuAction } from "./systemAdminFavorites.types";

/** Radix управляет фокусом; собственный fallback нужен лишь для удалённого trigger. */
export function useSystemAdminItemMenu(favoriteId: string, href?: string) {
  const favorites = useSystemAdminFavorites();
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyNotice, setCopyNotice] = useState({ text: "", error: false });
  const copyRequestRef = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dialogActionRef = useRef<(() => void) | null>(null);
  const selected = favorites?.selectedIds.includes(favoriteId) ?? false;
  const target = favorites?.targets.find((entry) => entry.id === favoriteId);
  const canFavorite = Boolean(target);
  const candidate = (href ?? target?.item.href)?.trim();
  let linkHref: string | undefined;
  try {
    // Фиксированная база только проверяет протокол: итоговый адрес копируется от реальной страницы.
    if (
      candidate &&
      ["http:", "https:"].includes(
        new URL(candidate, "https://navigation.invalid/").protocol,
      )
    ) {
      linkHref = candidate;
    }
  } catch {
    // Некорректный host URL не становится действием открытия или копирования.
  }
  return {
    open,
    setOpen: (next: boolean) => {
      copyRequestRef.current += 1;
      setCopying(false);
      setCopyNotice({ text: "", error: false });
      setOpen(next);
    },
    triggerRef,
    selected,
    available: canFavorite || Boolean(linkHref),
    canFavorite,
    linkHref,
    copying,
    copyNotice,
    copyLink: async () => {
      if (!linkHref || copying) return;
      const request = ++copyRequestRef.current;
      setCopying(true);
      setCopyNotice({ text: "", error: false });
      try {
        await navigator.clipboard.writeText(
          new URL(linkHref, window.location.href).href,
        );
        if (request === copyRequestRef.current) {
          setCopyNotice({ text: "Ссылка скопирована.", error: false });
        }
      } catch {
        if (request === copyRequestRef.current) {
          setCopyNotice({
            text: "Не удалось скопировать ссылку. Повторите попытку.",
            error: true,
          });
        }
      } finally {
        if (request === copyRequestRef.current) setCopying(false);
      }
    },
    chooseFavorite: () => {
      restoreFocusRef.current = selected
        ? (triggerRef.current?.closest<HTMLElement>("[data-favorites-list]") ??
          null)
        : null;
      favorites?.toggleFavorite(favoriteId);
    },
    chooseAction: (action: SystemAdminItemMenuAction) => {
      if (action.opensDialog) {
        // Сначала завершает жизнь FocusScope меню, затем монтирует scope диалога.
        dialogActionRef.current = action.onSelect;
        return;
      }
      restoreFocusRef.current =
        triggerRef.current?.closest<HTMLElement>('nav[tabindex="-1"]') ?? null;
      action.onSelect();
    },
    onCloseAutoFocus: (event: Event) => {
      const dialogAction = dialogActionRef.current;
      if (dialogAction) {
        event.preventDefault();
        requestAnimationFrame(() => {
          triggerRef.current?.focus({ preventScroll: true });
          dialogAction();
        });
      } else if (
        restoreFocusRef.current?.isConnected &&
        !triggerRef.current?.isConnected
      ) {
        event.preventDefault();
        restoreFocusRef.current.focus({ preventScroll: true });
      }
      dialogActionRef.current = null;
      restoreFocusRef.current = null;
    },
  };
}
