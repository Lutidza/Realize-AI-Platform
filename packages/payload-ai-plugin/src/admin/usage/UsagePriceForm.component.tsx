/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsagePriceForm.component.tsx
 * @version 1.0.0
 * @date 2026-10-05
 * @description Публикует проверяемый тариф владельца без фиктивных рыночных цен и изменения истории.
 */
"use client";
import { useState } from "react";
import { UiButton, UiInput, UiNotice, UiSelect } from "@realize/ui-kit";
import type { UsageFormProps } from "./UsageView.types";
import { useUsageCommand } from "./useUsageCommand.hook";
import { parseUsageMoney } from "./usageMoney.util";
import styles from "./Usage.module.css";

export function UsagePriceForm({ data, apiUrl, onSaved }: UsageFormProps) {
  const [basis, setBasis] = useState("provider");
  const [observedAt] = useState(() => new Date().toISOString());
  const command = useUsageCommand(`${apiUrl}/prices`, onSaved);
  if (data.view !== "platform") return null;
  return (
    <details>
      <summary>Опубликовать тариф</summary>
      <p>
        Укажите цену и источник её подтверждения. Для ChatGPT используется явная
        политика распределения подписки. Новая цена применяется только к новым
        попыткам.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          void command.run(() => ({
            schemaVersion: "1.0",
            installationId: data.installationId,
            revision: Number(f.get("revision")),
            basis,
            provider: basis === "infrastructure" ? "platform" : "openai-codex",
            model: String(f.get("model")),
            authMode:
              basis === "infrastructure"
                ? "internal"
                : String(f.get("authMode")),
            currency: String(f.get("currency")),
            method:
              basis === "customer"
                ? "customer_tariff"
                : basis === "infrastructure"
                  ? "infrastructure_allocation"
                  : String(f.get("method")),
            unit: basis === "infrastructure" ? "second" : "million_tokens",
            rates: {
              inputNanos:
                basis === "infrastructure"
                  ? null
                  : parseUsageMoney(f.get("input")),
              cachedInputNanos:
                basis === "infrastructure"
                  ? null
                  : parseUsageMoney(f.get("cached")),
              outputNanos:
                basis === "infrastructure"
                  ? null
                  : parseUsageMoney(f.get("output")),
              secondNanos:
                basis === "infrastructure"
                  ? parseUsageMoney(f.get("second"))
                  : null,
            },
            observedAt,
            effectiveFrom: new Date(
              String(f.get("effectiveFrom")),
            ).toISOString(),
            sourceRef: String(f.get("source")),
          }));
        }}
      >
        <div className={styles.grid}>
          <label>
            Вид цены
            <UiSelect
              value={basis}
              onChange={(event) => setBasis(event.target.value)}
            >
              <option value="provider">Себестоимость модели</option>
              <option value="customer">Цена клиента</option>
              <option value="infrastructure">Инфраструктура</option>
            </UiSelect>
          </label>
          <label>
            {basis === "infrastructure"
              ? "Операция: chat, workflow, execution, review"
              : "Точное имя модели"}
            <UiInput name="model" required maxLength={200} />
          </label>
          {basis !== "infrastructure" && (
            <label>
              Подключение
              <UiSelect name="authMode">
                <option value="apiKey">API key</option>
                <option value="chatgpt">ChatGPT</option>
                <option value="accessToken">Access token</option>
                <option value="workloadIdentity">Workload identity</option>
              </UiSelect>
            </label>
          )}
          {basis === "provider" && (
            <label>
              Основание цены
              <UiSelect name="method">
                <option value="api_tariff">Тариф API</option>
                <option value="contract_tariff">Договор</option>
                <option value="subscription_allocation">
                  Распределение подписки
                </option>
              </UiSelect>
            </label>
          )}
          <label>
            Валюта тарифа
            <UiInput
              name="currency"
              required
              pattern="[A-Z]{3}"
              maxLength={3}
              defaultValue="USD"
            />
          </label>
          <label>
            Ревизия тарифа
            <UiInput
              name="revision"
              type="number"
              min={1}
              max={1000000}
              defaultValue={1}
              required
            />
          </label>
          {basis === "infrastructure" ? (
            <label>
              Цена секунды
              <UiInput name="second" inputMode="decimal" required />
            </label>
          ) : (
            <>
              <label>
                Вход: цена 1 млн токенов
                <UiInput name="input" inputMode="decimal" required />
              </label>
              <label>
                Кеш: цена 1 млн токенов
                <UiInput name="cached" inputMode="decimal" required />
              </label>
              <label>
                Выход: цена 1 млн токенов
                <UiInput name="output" inputMode="decimal" required />
              </label>
            </>
          )}
          <label>
            Действует с (UTC)
            <UiInput
              name="effectiveFrom"
              required
              placeholder="2026-10-05T00:00:00Z"
              defaultValue={observedAt}
            />
          </label>
          <label>
            Ссылка на тариф или договор
            <UiInput
              name="source"
              required
              maxLength={512}
              placeholder="https://provider.example/pricing"
            />
          </label>
        </div>
        <div className={styles.actions}>
          <UiButton type="submit" disabled={command.pending}>
            Опубликовать тариф
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
