/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageReconcileForm.component.tsx
 * @version 1.0.0
 * @date 2026-10-05
 * @description Добавляет подтверждённую стоимость завершённой попытки с явной ссылкой на evidence.
 */
"use client";
import { useState } from "react";
import { UiButton, UiInput, UiNotice, UiSelect } from "@realize/ui-kit";
import type { UsageFormProps } from "./UsageView.types";
import { useUsageCommand } from "./useUsageCommand.hook";
import { parseUsageMoney } from "./usageMoney.util";
import styles from "./Usage.module.css";

export function UsageReconcileForm({ data, apiUrl, onSaved }: UsageFormProps) {
  const [observedAt] = useState(() => new Date().toISOString());
  const command = useUsageCommand(`${apiUrl}/reconcile`, onSaved);
  if (!("prices" in data)) return null;
  const items = data.items.filter((item) => item.outcome !== "running");
  return (
    <details>
      <summary>Сверить стоимость попытки</summary>
      <p>
        Указывается полная подтверждённая сумма выбранного вида расходов.
        Предыдущие события и тарифы сохраняются.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          void command.run(() => {
            const item = items.find(
              (attempt) => attempt.attemptId === f.get("attempt"),
            );
            if (!item) throw new Error("Выберите завершённую попытку.");
            return {
              attemptId: item.attemptId,
              expectedRevision: item.revision,
              basis: String(f.get("basis")),
              amountNanos: parseUsageMoney(f.get("amount")),
              currency: String(f.get("currency")),
              evidenceRef: String(f.get("evidence")),
              observedAt,
            };
          });
        }}
      >
        <div className={styles.grid}>
          <label>
            Попытка этой страницы
            <UiSelect name="attempt" required>
              <option value="">Выберите попытку</option>
              {items.map((item) => (
                <option key={item.attemptId} value={item.attemptId}>
                  {item.taskId} · {item.source} · {item.attemptId.slice(0, 8)}
                </option>
              ))}
            </UiSelect>
          </label>
          <label>
            Вид расхода
            <UiSelect name="basis">
              <option value="provider">Модель</option>
              <option value="infrastructure">Инфраструктура</option>
              <option value="customer">Клиентская сумма</option>
            </UiSelect>
          </label>
          <label>
            Подтверждённая сумма
            <UiInput name="amount" required inputMode="decimal" />
          </label>
          <label>
            Валюта сверки
            <UiInput
              name="currency"
              required
              pattern="[A-Z]{3}"
              maxLength={3}
              defaultValue="USD"
            />
          </label>
          <label>
            Ссылка на подтверждение
            <UiInput
              name="evidence"
              required
              maxLength={512}
              placeholder="invoice:2026-10:line-1"
            />
          </label>
        </div>
        <div className={styles.actions}>
          <UiButton type="submit" disabled={command.pending || !items.length}>
            Сохранить сверку
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
