/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageRecoveryForm.component.tsx
 * @version 1.0.0
 * @date 2026-10-05
 * @description Восстанавливает зависший учёт только по явному подтверждению владельца, сохраняя резерв.
 */
"use client";
import { useState } from "react";
import {
  UiButton,
  UiInput,
  UiNotice,
  UiSelect,
  UiSwitch,
} from "@realize/ui-kit";
import type { UsageFormProps } from "./UsageView.types";
import { useUsageCommand } from "./useUsageCommand.hook";
import styles from "./Usage.module.css";

export function UsageRecoveryForm({ data, apiUrl, onSaved }: UsageFormProps) {
  const [observedAt] = useState(() => new Date().toISOString());
  const command = useUsageCommand(`${apiUrl}/abandon`, onSaved);
  if (!("prices" in data)) return null;
  const items = data.items.filter((item) => item.outcome === "running");
  return (
    <details>
      <summary>Восстановить учёт после сбоя процесса</summary>
      <p>
        Сначала остановите фактическое выполнение и подтвердите это ссылкой на
        журнал или инцидент. Запись получит статус ошибки; резерв останется до
        отдельной сверки суммы.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          void command.run(() => {
            const item = items.find(
              (attempt) => attempt.attemptId === f.get("attempt"),
            );
            if (!item) throw new Error("Выберите зависшую попытку.");
            return {
              attemptId: item.attemptId,
              expectedRevision: item.revision,
              runtimeStopped: f.get("stopped") === "on",
              evidenceRef: String(f.get("evidence")),
              observedAt,
            };
          });
        }}
      >
        <div className={styles.grid}>
          <label>
            Зависшая попытка
            <UiSelect name="attempt" required>
              <option value="">Выберите попытку</option>
              {items.map((item) => (
                <option key={item.attemptId} value={item.attemptId}>
                  {item.taskId} · {item.attemptId.slice(0, 8)}
                </option>
              ))}
            </UiSelect>
          </label>
          <label>
            Подтверждение остановки
            <UiInput
              name="evidence"
              required
              placeholder="incident:2026-10-05:1"
            />
          </label>
        </div>
        <label>
          <UiSwitch name="stopped" required /> Я проверил, что выполнение этой
          попытки остановлено
        </label>
        <div className={styles.actions}>
          <UiButton
            type="submit"
            variant="secondary"
            disabled={command.pending || !items.length}
          >
            Закрыть зависшую запись
          </UiButton>
        </div>
        {command.error && (
          <UiNotice tone="danger" role="alert">
            {command.error}
          </UiNotice>
        )}
      </form>
    </details>
  );
}
