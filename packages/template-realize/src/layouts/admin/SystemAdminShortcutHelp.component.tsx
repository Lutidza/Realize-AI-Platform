/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminShortcutHelp.component.tsx
 * @version 1.0.1
 * @date 2026-10-12
 * @description Показывает только действующие клавиши общей навигации и поиска.
 * @see documentation/architecture/system-admin-shell.md
 */
import { UiDialog } from "@realize/ui-kit";
import { systemAdminMessages } from "./systemAdminLocale.messages";
import type { SystemAdminShortcutHelpProps } from "./SystemAdminToolbar.types";
import styles from "./SystemAdminProfileMenu.module.css";

export function SystemAdminShortcutHelp({
  open,
  onOpenChange,
  theme,
  locale,
}: SystemAdminShortcutHelpProps) {
  const t = systemAdminMessages[locale];
  const shortcuts = [
    ["Ctrl / ⌘ K", t.search],
    ["↑ ↓", t.chooseItem],
    ["Enter", t.openItem],
    ["Tab", t.nextControl],
    ["Esc", t.closePanel],
  ];
  return (
    <UiDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={theme}
      title={t.shortcuts}
      description={t.shortcutsDescription}
    >
      <dl className={styles.shortcuts}>
        {shortcuts.map(([keys, description]) => (
          <div key={keys}>
            <dt>{description}</dt>
            <dd>
              <kbd>{keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </UiDialog>
  );
}
