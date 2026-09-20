/**
 * @file src/components/admin/task-manager/reference/TaskDetailSections.component.tsx
 * @version 1.1.0
 * @date 2026-09-17
 * @description Отображает связи задач, обсуждения и демонстрационное досье.
 * @see documentation/specifications/task-management.md
 */

"use client";

import { useState } from "react";
import { UiBadge, UiButton, UiSelect } from "@realize/ui-kit";
import {
  ArrowRight,
  FileText,
  Folder,
  Link2,
  MessageSquare,
  Unlink,
} from "lucide-react";
import type { PrototypeTask } from "./taskManager.types";
import type { TaskDetailSectionProps } from "./TaskDetail.types";
import styles from "./TaskDetailSections.module.css";

/** Сохраняет различие блокирующей зависимости и обычной связи; диалоги остаются демонстрационными. */
export function TaskRelations({
  task,
  state,
  dispatch,
  onOpenTask,
}: TaskDetailSectionProps) {
  const [targetId, setTargetId] = useState("");
  const [kind, setKind] = useState<"related" | "depends_on">("depends_on");
  const [conversationId, setConversationId] = useState("");
  const candidates = state.tasks.filter(
    (item) => item.id !== task.id && !item.archived,
  );
  const relationGroups = [
    { kind: "depends_on" as const, title: "Зависит от", ids: task.dependsOn },
    { kind: "related" as const, title: "Связанные задачи", ids: task.related },
  ];
  const linkedConversations = state.conversations.filter((item) =>
    task.conversationIds.includes(item.id),
  );
  return (
    <div className={styles.stack}>
      <section className={styles.section}>
        <h3>
          <Link2 size={16} aria-hidden="true" /> Связи задач
        </h3>
        <p className={styles.muted}>
          Зависимость удерживает запуск до завершения нужной работы. Обычная
          связь объединяет контекст.
        </p>
        {relationGroups.map((group) => (
          <div className={styles.stack} key={group.kind}>
            <h4>{group.title}</h4>
            {group.ids.length === 0 && (
              <p className={styles.empty}>Пока нет связей</p>
            )}
            {group.ids.map((id) => {
              const linked = state.tasks.find((item) => item.id === id);
              return linked ? (
                <div className={styles.linkRow} key={id}>
                  <UiButton
                    variant="ghost"
                    className={styles.taskLink}
                    onClick={() => onOpenTask(id)}
                  >
                    <span className={styles.muted}>{id}</span>
                    <span>{linked.title}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </UiButton>
                  <UiButton
                    variant="ghost"
                    size="icon"
                    aria-label={`Удалить связь с ${id}`}
                    onClick={() =>
                      dispatch({
                        type: "task/link",
                        taskId: task.id,
                        targetId: id,
                        kind: group.kind,
                        remove: true,
                      })
                    }
                  >
                    <Unlink size={14} aria-hidden="true" />
                  </UiButton>
                </div>
              ) : null;
            })}
          </div>
        ))}
        <form
          className={styles.linkForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (targetId)
              dispatch({ type: "task/link", taskId: task.id, targetId, kind });
          }}
        >
          <label>
            Тип связи
            <UiSelect
              aria-label="Тип связи"
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              <option value="depends_on">Зависит от</option>
              <option value="related">Связана с</option>
            </UiSelect>
          </label>
          <label>
            Задача
            <UiSelect
              aria-label="Связываемая задача"
              required
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">Выберите задачу</option>
              {candidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} · {item.title}
                </option>
              ))}
            </UiSelect>
          </label>
          <UiButton variant="secondary" type="submit" disabled={!targetId}>
            Связать
          </UiButton>
        </form>
      </section>
      <section className={styles.section}>
        <h3>
          <MessageSquare size={16} aria-hidden="true" /> Диалоги по задаче
        </h3>
        <p className={styles.muted}>
          Обсуждение и задача сохраняют связь в обе стороны.
        </p>
        {linkedConversations.length === 0 && (
          <p className={styles.empty}>
            Добавьте обсуждение, в котором появилась задача.
          </p>
        )}
        {linkedConversations.map((conversation) => (
          <details className={styles.conversation} key={conversation.id}>
            <summary>
              <MessageSquare size={16} aria-hidden="true" />
              <span>{conversation.title}</span>
              <UiBadge>{conversation.messages.length}</UiBadge>
            </summary>
            <div className={styles.conversationBody}>
              <p className={styles.muted}>{conversation.purpose}</p>
              <div>
                <UiButton
                  size="small"
                  variant="ghost"
                  disabled={task.archived}
                  onClick={() =>
                    dispatch({
                      type: "task/conversation",
                      taskId: task.id,
                      conversationId: conversation.id,
                    })
                  }
                >
                  <Unlink size={14} aria-hidden="true" /> Удалить привязку
                  диалога
                </UiButton>
              </div>
              {conversation.messages.map((message) => (
                <article className={styles.message} key={message.id}>
                  <strong>{message.author}</strong>
                  <p>{message.text}</p>
                </article>
              ))}
              <h4>Задачи из этого диалога</h4>
              {state.tasks
                .filter((item) =>
                  item.conversationIds.includes(conversation.id),
                )
                .map((item) => (
                  <UiButton
                    key={item.id}
                    variant="ghost"
                    className={styles.taskLink}
                    disabled={item.id === task.id}
                    onClick={() => onOpenTask(item.id)}
                  >
                    {item.id} · {item.title}
                    <ArrowRight size={14} aria-hidden="true" />
                  </UiButton>
                ))}
            </div>
          </details>
        ))}
        <form
          className={styles.inlineForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (conversationId) {
              const result = dispatch({
                type: "task/conversation",
                taskId: task.id,
                conversationId,
              });
              if (result.ok) setConversationId("");
            }
          }}
        >
          <label>
            Добавить диалог
            <UiSelect
              aria-label="Добавить диалог"
              required
              value={conversationId}
              onChange={(event) => setConversationId(event.target.value)}
            >
              <option value="">Выберите обсуждение</option>
              {state.conversations
                .filter((item) => !task.conversationIds.includes(item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </UiSelect>
          </label>
          <UiButton
            type="submit"
            variant="secondary"
            disabled={!conversationId}
          >
            Добавить
          </UiButton>
        </form>
      </section>
    </div>
  );
}

const dossierFolders = [
  ["references", "Референсы"],
  ["screenshots", "Скриншоты"],
  ["snapshots", "Снимки"],
  ["logs", "Логи"],
  ["drafts", "Черновики"],
  ["tmp", "Временное"],
] as const;

/** Показывает структуру досье и содержимое фиктивных файлов без обращения к файловой системе. */
export function TaskDossier({ task }: { task: PrototypeTask }) {
  const [selectedId, setSelectedId] = useState(task.artifacts[0]?.id ?? "");
  const selected = task.artifacts.find((item) => item.id === selectedId);
  const fileButton = (artifact: PrototypeTask["artifacts"][number]) => (
    <UiButton
      key={artifact.id}
      variant="ghost"
      className={styles.fileButton}
      aria-pressed={selectedId === artifact.id}
      onClick={() => setSelectedId(artifact.id)}
    >
      <FileText size={14} aria-hidden="true" />
      <span>{artifact.path.split("/").at(-1)}</span>
    </UiButton>
  );
  return (
    <div className={styles.stack}>
      <div>
        <h3>Досье задачи</h3>
        <p className={styles.muted}>
          Все материалы, результаты и доказательства в одном месте.
        </p>
      </div>
      <div className={styles.dossier}>
        <nav className={styles.fileTree} aria-label="Файлы досье">
          {task.artifacts
            .filter((item) => !item.path.includes("/"))
            .map(fileButton)}
          {dossierFolders.map(([folder, label]) => {
            const files = task.artifacts.filter((item) =>
              item.path.startsWith(`${folder}/`),
            );
            return (
              <details key={folder} open>
                <summary>
                  <Folder size={14} aria-hidden="true" />
                  <span>{folder}/</span>
                  <small>{files.length}</small>
                </summary>
                <div className={styles.folderFiles} aria-label={label}>
                  {files.length ? (
                    files.map(fileButton)
                  ) : (
                    <span className={styles.empty}>Нет файлов</span>
                  )}
                </div>
              </details>
            );
          })}
        </nav>
        <section className={styles.filePreview} aria-label="Просмотр файла">
          {selected ? (
            <>
              <header>
                <FileText size={16} aria-hidden="true" />
                <strong>{selected.path}</strong>
                <UiBadge>v{selected.version}</UiBadge>
              </header>
              <pre>{selected.content}</pre>
            </>
          ) : (
            <p className={styles.empty}>Выберите файл в дереве досье.</p>
          )}
        </section>
      </div>
    </div>
  );
}
