/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageBudgetForm.component.tsx
 * @version 1.0.0
 * @date 2026-10-05
 * @description Редактирует отдельный месячный бюджет установки с CAS и явным резервом на попытку.
 */
"use client";
import { useState } from "react";
import { UiButton, UiInput, UiNotice, UiSelect } from "@realize/ui-kit";
import type { UsageFormProps } from "./UsageView.types";
import { useUsageCommand } from "./useUsageCommand.hook";
import { formatUsageMoney, parseUsageMoney } from "./usageMoney.util";
import styles from "./Usage.module.css";

export function UsageBudgetForm({ data, apiUrl, onSaved }: UsageFormProps) {
  const [basis, setBasis] = useState(
    data.view === "platform" ? "provider" : "customer",
  );
  const [purpose, setPurpose] = useState("customer_runtime");
  const current = data.budgets.find(
    (b) =>
      b.policy.installationId === data.installationId &&
      b.policy.projectId === data.projectId &&
      b.policy.basis === basis &&
      b.policy.purpose === purpose,
  )?.policy;
  const command = useUsageCommand(`${apiUrl}/budget`, onSaved);
  return (
    <details>
      <summary>Настроить бюджет этой установки</summary>
      <p>
        Месяц считается по UTC. Резерв ограничивает одновременные попытки.
        Фактический расход может превысить резерв; неизвестный итог удерживает
        его до сверки.
      </p>
      <form
        key={`${basis}:${purpose}:${current?.revision ?? 0}`}
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          void command.run(() => ({
            expectedRevision: current?.revision ?? 0,
            policy: {
              schemaVersion: "1.0",
              installationId: data.installationId,
              projectId: data.projectId,
              purpose,
              basis,
              revision: (current?.revision ?? 0) + 1,
              currency: String(fields.get("currency")),
              mode: String(fields.get("mode")),
              limitNanos: String(fields.get("limit")).trim()
                ? parseUsageMoney(fields.get("limit"))
                : null,
              reservationNanos: parseUsageMoney(fields.get("reserve")),
            },
          }));
        }}
      >
        <div className={styles.grid}>
          {data.view === "platform" && (
            <>
              <label>
                Бюджет
                <UiSelect
                  value={basis}
                  onChange={(event) => {
                    setBasis(event.target.value);
                    if (event.target.value === "customer")
                      setPurpose("customer_runtime");
                  }}
                >
                  <option value="provider">Себестоимость модели</option>
                  <option value="customer">Клиентская оценка</option>
                </UiSelect>
              </label>
              <label>
                Назначение
                <UiSelect
                  value={purpose}
                  disabled={basis === "customer"}
                  onChange={(event) => setPurpose(event.target.value)}
                >
                  <option value="customer_runtime">Работа сайта</option>
                  <option value="development">Разработка платформы</option>
                  <option value="evaluation">Оценка качества</option>
                </UiSelect>
              </label>
            </>
          )}
          <label>
            Валюта
            <UiInput
              name="currency"
              required
              pattern="[A-Z]{3}"
              maxLength={3}
              defaultValue={current?.currency ?? "USD"}
              readOnly={Boolean(current)}
            />
          </label>
          <label>
            Месячный лимит
            <UiInput
              name="limit"
              inputMode="decimal"
              placeholder="Без лимита"
              defaultValue={
                current?.limitNanos ? formatUsageMoney(current.limitNanos) : ""
              }
            />
          </label>
          <label>
            Резерв на попытку
            <UiInput
              name="reserve"
              required
              inputMode="decimal"
              defaultValue={
                current ? formatUsageMoney(current.reservationNanos) : ""
              }
            />
          </label>
          <label>
            Режим
            <UiSelect name="mode" defaultValue={current?.mode ?? "soft"}>
              <option value="soft">Предупреждать</option>
              <option value="hard">Блокировать новые попытки</option>
            </UiSelect>
          </label>
        </div>
        <div className={styles.actions}>
          <UiButton type="submit" disabled={command.pending}>
            Сохранить бюджет
          </UiButton>
        </div>
        {command.error && (
          <UiNotice tone="danger" role="alert">
            {command.error}
          </UiNotice>
        )}
        {command.saved && <UiNotice role="status">Бюджет сохранён.</UiNotice>}
      </form>
    </details>
  );
}
