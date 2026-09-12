/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatWorkflowSelection.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Показывает явный выбор процесса выбранного профиля и дополнительные входные данные.
 */

"use client";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { UiButton, UiInput, UiNotice, UiTextarea } from "@realize/ui-kit";
import type { ChatWorkflowSelectionProps } from "./ChatWorkflow.types";
import { useChatAgentConfigurationPicker } from "./useChatAgentConfigurationPicker.hook";
import styles from "./ChatAgentConfiguration.module.css";

/** Список повторяет плотность и навигацию выбора профиля, включая страницы по 25. */
export const ChatWorkflowSelection = ({
  controller,
  disabled,
}: ChatWorkflowSelectionProps) => {
  const { agentConfiguration: configuration, workflow } = controller;
  const profile = configuration.catalog?.profiles.find(
    (item) => item.key === configuration.selection?.profileKey,
  );
  const workflows = profile?.workflows ?? [];
  const picker = useChatAgentConfigurationPicker({ profiles: workflows });
  const selected = workflow.isSelectionReady
    ? workflows.find((item) => item.key === workflow.key)
    : undefined;
  if (!workflows.length && !workflow.key) return null;
  return (
    <div className={styles.picker}>
      <details>
        <summary aria-label="Рабочий процесс для следующего сообщения">
          <span>
            <small>Режим сообщения</small>
            <strong>{selected?.title || workflow.key || "Обычный чат"}</strong>
          </span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className={styles.content}>
          <p className={styles.empty}>
            Процесс выполняет связанные шаги. После каждого ответа вы можете
            продолжить его или вернуться в обычный чат.
          </p>
          <UiButton
            size="small"
            variant="secondary"
            aria-pressed={!workflow.key}
            disabled={disabled}
            onClick={() => workflow.select("")}
          >
            Обычный чат
          </UiButton>
          {!workflow.isSelectionReady && (
            <UiNotice role="status">
              Выбранный процесс недоступен для текущего профиля. Выберите
              процесс снова; введённые данные сохранены.
            </UiNotice>
          )}
          <UiInput
            type="search"
            aria-label="Поиск рабочих процессов"
            placeholder="Название, ключ или назначение"
            value={picker.query}
            onChange={(event) => picker.setQuery(event.target.value)}
          />
          <div className={styles.pagination}>
            <span>Процессов: {picker.count}</span>
            <div>
              <UiButton
                size="icon"
                variant="ghost"
                aria-label="Предыдущая страница процессов"
                disabled={picker.page === 1}
                onClick={() => picker.setPage(picker.page - 1)}
              >
                <ChevronLeft size={15} />
              </UiButton>
              <span>
                {picker.page} / {picker.pageCount}
              </span>
              <UiButton
                size="icon"
                variant="ghost"
                aria-label="Следующая страница процессов"
                disabled={picker.page === picker.pageCount}
                onClick={() => picker.setPage(picker.page + 1)}
              >
                <ChevronRight size={15} />
              </UiButton>
            </div>
          </div>
          <ul
            className={styles.rows}
            tabIndex={0}
            aria-label="Доступные рабочие процессы"
            key={JSON.stringify([picker.query, picker.page])}
          >
            {picker.rows.map((item) => (
              <li key={item.key}>
                <UiButton
                  variant="ghost"
                  aria-pressed={selected?.key === item.key}
                  aria-label={`Выбрать процесс «${item.title || item.key}»`}
                  disabled={disabled || !configuration.isReady}
                  onClick={() => workflow.select(item.key)}
                >
                  <span>
                    <strong>{item.title || item.key}</strong>
                    <small>
                      {item.description || item.key}
                      {profile?.defaultWorkflowKey === item.key
                        ? " · Рекомендуемый в профиле"
                        : ""}
                    </small>
                  </span>
                  {selected?.key === item.key && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </UiButton>
              </li>
            ))}
          </ul>
          {!picker.rows.length && (
            <p className={styles.empty}>Процессы по запросу не найдены.</p>
          )}
          {workflow.key && (
            <details>
              <summary>Дополнительные данные процесса</summary>
              <div className={styles.content}>
                <UiTextarea
                  aria-label="Входные данные процесса (JSON)"
                  placeholder={'{"productID": "123"}'}
                  rows={4}
                  maxLength={131072}
                  value={workflow.inputText}
                  disabled={disabled}
                  onChange={(event) =>
                    workflow.setInputText(event.target.value)
                  }
                />
                <p className={styles.empty}>
                  Необязательный JSON-объект. Текст сообщения передаётся
                  процессу отдельно.
                </p>
              </div>
            </details>
          )}
        </div>
      </details>
    </div>
  );
};
