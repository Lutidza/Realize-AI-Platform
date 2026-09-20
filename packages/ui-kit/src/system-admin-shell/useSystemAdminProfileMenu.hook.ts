/**
 * @file packages/ui-kit/src/system-admin-shell/useSystemAdminProfileMenu.hook.ts
 * @version 1.1.0
 * @date 2026-09-19
 * @description Управляет выбором языка и открывает справку после безопасного закрытия профиля.
 * @see documentation/architecture/system-admin-shell.md
 */
import { useId, useState } from "react";
import { useSystemAdminActionMenu } from "./useSystemAdminActionMenu.hook";

export function useSystemAdminProfileMenu() {
  const menu = useSystemAdminActionMenu();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const languagesId = useId();
  return {
    ...menu,
    languagesOpen,
    languagesId,
    toggleLanguages: () => setLanguagesOpen((open) => !open),
    setOpen: (open: boolean) => {
      menu.setOpen(open);
      if (!open) setLanguagesOpen(false);
    },
    shortcutsOpen,
    setShortcutsOpen,
    openShortcuts: () => menu.select(() => setShortcutsOpen(true)),
  };
}
