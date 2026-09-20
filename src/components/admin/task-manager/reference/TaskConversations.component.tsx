/**
 * @file src/components/admin/task-manager/reference/TaskConversations.component.tsx
 * @version 1.1.0
 * @date 2026-09-17
 * @description Показывает демонстрационные диалоги и обратные ссылки на задачи.
 */

import { useState } from "react";
import { MessageSquare, ArrowUpRight } from "lucide-react";
import { UiBadge, UiButton } from "@realize/ui-kit";
import type { TaskConversationsProps } from "./TaskWorkbench.types";
import styles from "./TaskConversations.module.css";

export function TaskConversations({
  tasks,
  state,
  onOpenTask,
}: TaskConversationsProps) {
  const conversations = state.conversations.filter((conversation) =>
    tasks.some((task) => task.conversationIds.includes(conversation.id)),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ??
    conversations[0];
  return (
    <div className={styles.conversations}>
      <nav className={styles.conversationList} aria-label="Диалоги задач">
        <h3>Связанные обсуждения</h3>
        {conversations.map((conversation) => (
          <UiButton
            key={conversation.id}
            variant="ghost"
            className={styles.conversationButton}
            aria-pressed={selected?.id === conversation.id}
            onClick={() => setSelectedId(conversation.id)}
          >
            <MessageSquare size={17} />
            <span>
              {conversation.title}
              <small>{conversation.purpose}</small>
            </span>
          </UiButton>
        ))}
        {!selected && <p>К задачам пока не привязаны диалоги.</p>}
      </nav>
      {selected && (
        <section className={styles.conversationBody}>
          <div className={styles.conversationHeader}>
            <div>
              <UiBadge>Демо-диалог</UiBadge>
              <h2>{selected.title}</h2>
            </div>
            <MessageSquare size={24} />
          </div>
          <div className={styles.messages}>
            {selected.messages.map((message) => (
              <article
                id={`message-${message.id}`}
                key={message.id}
                className={styles.message}
              >
                <strong>{message.author}</strong>
                <p>{message.text}</p>
                <small>#{message.id}</small>
              </article>
            ))}
          </div>
          <div className={styles.backlinks}>
            <h3>Задачи из этого диалога</h3>
            {state.tasks
              .filter((task) => task.conversationIds.includes(selected.id))
              .map((task) => (
                <UiButton
                  key={task.id}
                  variant="secondary"
                  size="small"
                  onClick={() => onOpenTask(task.id)}
                >
                  <ArrowUpRight size={14} />
                  {task.id} · {task.title}
                </UiButton>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
