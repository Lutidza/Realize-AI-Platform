/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatToolbar.component.tsx
 * @version 1.1.0
 * @date 2026-09-09
 * @description Показывает навигацию, выбранный разговор и общее меню размещения.
 */

import { UiButton } from "@realize/ui-kit";
import {
  AppWindow,
  Check,
  Maximize2,
  PanelLeft,
  PanelRight,
  Settings2,
  SquarePen,
  X,
} from "lucide-react";
import { CodexLogo } from "../integrations/codex/CodexLogo.component";
import { AdminMenu } from "../ui/AdminMenu.component";
import type { ChatWorkspaceViewProps } from "./ChatWorkspace.types";
import styles from "./ChatWorkspace.module.css";
export const ChatToolbar = ({
  controller,
  onClose,
  onOpenSettings,
  onChangeDisplayMode,
  variant,
  workspace,
}: ChatWorkspaceViewProps) => (
  <header className={styles.toolbar}>
    <UiButton
      aria-controls={workspace.historyId}
      id={workspace.historyToggleId}
      aria-expanded={workspace.isHistoryOpen}
      aria-label={
        workspace.isHistoryOpen ? "Закрыть историю" : "Открыть историю"
      }
      title="История диалогов"
      onClick={workspace.toggleHistory}
      size="icon"
      variant="ghost"
    >
      <PanelLeft size={18} />
    </UiButton>
    <div className={styles.identity}>
      <CodexLogo className={styles.logo} />
      <div className={styles.title}>
        <strong>Codex</strong>
        <span title={workspace.activeTitle}>{workspace.activeTitle}</span>
      </div>
    </div>
    <div className={styles.actions}>
      <UiButton
        aria-label="Новый диалог"
        title="Новый диалог"
        disabled={workspace.isBusy || !controller.ready}
        onClick={() => void workspace.startConversation()}
        size="icon"
        variant="ghost"
      >
        <SquarePen size={18} />
      </UiButton>
      {onChangeDisplayMode ? (
        <AdminMenu
          label="Размещение чата"
          icon={
            variant === "window" ? (
              <AppWindow size={18} />
            ) : variant === "page" ? (
              <Maximize2 size={18} />
            ) : (
              <PanelRight size={18} />
            )
          }
          disabled={
            controller.isSubmitting ||
            controller.isCreatingConversation ||
            controller.context.hasPendingAttachments ||
            controller.context.hasFailedAttachments
          }
        >
          <UiButton
            aria-pressed={variant === "panel"}
            onClick={() => workspace.changeDisplayMode("panel")}
            variant="ghost"
            size="small"
          >
            <PanelRight size={16} />
            Правая панель{variant === "panel" ? <Check size={14} /> : null}
          </UiButton>
          <UiButton
            aria-pressed={variant === "page"}
            onClick={() => workspace.changeDisplayMode("page")}
            variant="ghost"
            size="small"
          >
            <Maximize2 size={16} />
            Контентная область{variant === "page" ? <Check size={14} /> : null}
          </UiButton>
          <UiButton
            aria-pressed={variant === "window"}
            onClick={() => workspace.changeDisplayMode("window")}
            variant="ghost"
            size="small"
          >
            <AppWindow size={16} />
            Отдельное окно{variant === "window" ? <Check size={14} /> : null}
          </UiButton>
        </AdminMenu>
      ) : null}
      {onOpenSettings ? (
        <UiButton
          aria-label="Настройки чата"
          title="Настройки чата"
          onClick={onOpenSettings}
          size="icon"
          variant="ghost"
        >
          <Settings2 size={18} />
        </UiButton>
      ) : null}
      {onClose ? (
        <UiButton
          aria-label="Закрыть AI-ассистента"
          title="Закрыть чат"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X size={19} />
        </UiButton>
      ) : null}
    </div>
  </header>
);
