/**
 * @file packages/payload-ai-plugin/src/admin/chat/ConversationHistory.component.tsx
 * @version 1.2.0
 * @date 2026-09-11
 * @description Показывает полноразмерную историю, поиск, группы дат и архив.
 */

"use client";
import { UiButton, UiInput, UiNotice, UiSurface } from "@realize/ui-kit";
import {
  Archive,
  ArrowLeft,
  MoreHorizontal,
  Search,
  SquarePen,
  X,
} from "lucide-react";
import { AdminMenu } from "../ui/AdminMenu.component";
import { useConversationHistory } from "./useConversationHistory.hook";
import type { ConversationHistoryProps } from "./ConversationHistory.types";
import styles from "./ConversationHistory.module.css";
export const ConversationHistory = (props: ConversationHistoryProps) => {
  const {
    id,
    onClose,
    onOpen,
    onStart,
    onSearchChange,
    search,
    selectedId,
    busy,
  } = props;
  const history = useConversationHistory(props);
  return (
    <aside
      className={styles.history}
      id={id}
      aria-label="История диалогов"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className={styles.heading}>
        <strong>{history.showArchived ? "Архив" : "Диалоги"}</strong>
        <UiButton
          aria-label="Скрыть историю"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X size={16} />
        </UiButton>
      </div>
      <UiButton
        className={styles.newChat}
        disabled={busy || props.canStart === false}
        onClick={onStart}
        variant="ghost"
      >
        <SquarePen size={17} />
        Новый диалог
      </UiButton>
      <label className={styles.search}>
        <Search size={15} aria-hidden="true" />
        <UiInput
          aria-label="Поиск диалогов"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск диалогов"
          type="search"
          value={search}
        />
      </label>
      <div className={styles.list}>
        {history.groups.length ? (
          history.groups.map((group) => (
            <section key={group.label}>
              <h3>{group.label}</h3>
              {group.items.map((conversation) => (
                <div
                  className={styles.row}
                  key={conversation.id}
                  data-selected={selectedId === conversation.id}
                >
                  <UiButton
                    aria-current={
                      selectedId === conversation.id ? "page" : undefined
                    }
                    className={styles.conversation}
                    title={conversation.title}
                    onClick={() => onOpen(conversation.id)}
                    variant="ghost"
                  >
                    <span>{conversation.title}</span>
                  </UiButton>
                  {conversation.status !== "archived" ? (
                    <AdminMenu
                      label={`Действия: ${conversation.title}`}
                      icon={<MoreHorizontal size={16} />}
                    >
                      <UiButton
                        onClick={() => history.requestArchive(conversation)}
                        variant="ghost"
                        size="small"
                      >
                        <Archive size={15} />
                        Архивировать
                      </UiButton>
                    </AdminMenu>
                  ) : null}
                </div>
              ))}
            </section>
          ))
        ) : (
          <p className={styles.empty}>
            {search
              ? "Диалоги не найдены"
              : history.showArchived
                ? "В архиве пока нет диалогов"
                : "Ваши диалоги появятся здесь"}
          </p>
        )}
      </div>
      {history.archiveTarget ? (
        <UiSurface
          className={styles.confirm}
          role="alertdialog"
          aria-label="Архивировать диалог?"
        >
          <strong>Архивировать диалог?</strong>
          <p>«{history.archiveTarget.title}» останется доступен в архиве.</p>
          {history.error ? (
            <UiNotice tone="danger">{history.error}</UiNotice>
          ) : null}
          <div>
            <UiButton
              onClick={history.cancelArchive}
              disabled={history.isArchiving}
              size="small"
              variant="ghost"
            >
              Отмена
            </UiButton>
            <UiButton
              onClick={() => void history.confirmArchive()}
              disabled={history.isArchiving}
              size="small"
              variant="danger"
            >
              {history.isArchiving ? "Архивируем…" : "Архивировать"}
            </UiButton>
          </div>
        </UiSurface>
      ) : null}
      <UiButton
        className={styles.archiveLink}
        aria-pressed={history.showArchived}
        onClick={() => history.setShowArchived(!history.showArchived)}
        variant="ghost"
        size="small"
      >
        {history.showArchived ? <ArrowLeft size={15} /> : <Archive size={15} />}{" "}
        {history.showArchived ? "Все диалоги" : "Архив"}
      </UiButton>
    </aside>
  );
};
