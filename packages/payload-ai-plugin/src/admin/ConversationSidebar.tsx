/**
 * @file packages/payload-ai-plugin/src/admin/ConversationSidebar.tsx
 * @version 2026-08-18
 * @description Renders conversation creation, filtering and selection controls.
 */

import type { ConversationDTO } from "@realize/ai-contracts";
import { MessageSquare, Plus, Search } from "lucide-react";

import styles from "./ConversationSidebar.module.css";

type ConversationSidebarProps = {
  conversations: ConversationDTO[];
  disabled: boolean;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onSearchChange: (value: string) => void;
  search: string;
  selectedID?: string;
  variant: "drawer" | "page";
};

/** Renders the navigation owner for the Admin AI conversation list. */
export const ConversationSidebar = ({
  conversations,
  disabled,
  onCreate,
  onOpen,
  onSearchChange,
  search,
  selectedID,
  variant,
}: ConversationSidebarProps) => {
  const normalizedSearch = search.toLocaleLowerCase();
  const visibleConversations = conversations.filter((conversation) =>
    conversation.title.toLocaleLowerCase().includes(normalizedSearch),
  );

  return (
    <aside
      className={variant === "drawer" ? styles.drawerHistory : styles.sidebar}
      aria-label="История диалогов"
    >
      <button
        className={styles.newConversation}
        disabled={disabled}
        onClick={onCreate}
        type="button"
      >
        <Plus size={16} />
        Новый диалог
      </button>
      <label className={styles.searchLabel}>
        <Search size={15} aria-hidden="true" />
        <span className={styles.srOnly}>Поиск</span>
        <input
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Название диалога"
          type="search"
          value={search}
        />
      </label>
      <div className={styles.conversationList}>
        {visibleConversations.length ? (
          visibleConversations.map((conversation) => (
            <button
              className={
                selectedID === conversation.id
                  ? styles.conversationActive
                  : styles.conversation
              }
              key={conversation.id}
              onClick={() => onOpen(conversation.id)}
              type="button"
            >
              <MessageSquare size={15} aria-hidden="true" />
              <span>
                <strong>{conversation.title}</strong>
                <small>
                  {new Date(conversation.lastMessageAt).toLocaleString("ru-RU")}
                </small>
              </span>
            </button>
          ))
        ) : (
          <p className={styles.noConversations}>Диалоги не найдены.</p>
        )}
      </div>
    </aside>
  );
};
