/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageAttempts.component.tsx
 * @version 1.1.0
 * @date 2026-10-06
 * @description Показывает попытки и owner provenance из раздельных серверных DTO.
 */
"use client";
import { UiSurface } from "@realize/ui-kit";
import type { UsagePageData } from "./UsageView.types";
import { formatUsageMoney } from "./usageMoney.util";
import {
  usageOutcomeLabels,
  usageSourceLabels,
  usagePurposeLabels,
} from "./usageLabels.config";
import styles from "./Usage.module.css";

export function UsageAttempts({ data }: { data: UsagePageData }) {
  return (
    <UiSurface className={styles.surface}>
      <h2>Попытки</h2>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Задача</th>
              <th>Модель / операция</th>
              <th>Админский агент</th>
              <th>Результат</th>
              <th>Токены</th>
              <th>Клиентская сумма</th>
              {data.view === "platform" && <th>Себестоимость</th>}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.attemptId}>
                <td className={styles.details}>
                  <strong>{item.taskId}</strong>
                  <br />
                  <time dateTime={item.startedAt}>
                    {new Date(item.startedAt).toLocaleString("ru-RU")}
                  </time>
                  <div>Попытка {item.attemptNumber}</div>
                  <details>
                    <summary>Подробности</summary>
                    <div>ID: {item.attemptId}</div>
                    <div>Шаг операции: {item.operationKey ?? "—"}</div>
                    <div>
                      Процесс: {item.workflowKey ?? "—"} /{" "}
                      {item.workflowStepKey ?? "—"}
                    </div>
                    <div>
                      Время:{" "}
                      {item.durationMs === null
                        ? "—"
                        : `${Math.round(item.durationMs / 1000)} с`}
                      ; команды:{" "}
                      {item.toolDurationMs === null
                        ? "—"
                        : `${item.toolDurationMs} мс`}
                    </div>
                    {"providerCost" in item && (
                      <>
                        <div>
                          Установка: {item.installationId} / {item.projectId}
                        </div>
                        <div>
                          {usagePurposeLabels[item.purpose]} · {item.authMode}
                        </div>
                        <div>
                          Платформа: {item.platformReleaseId ?? "Не задана"}
                        </div>
                        <div>
                          Система: {item.systemReleaseId ?? "—"}; админский
                          слой: {item.overlayReleaseId ?? "—"}
                        </div>
                        <div>
                          Model Garden:{" "}
                          {item.modelCatalogRevision ?? "Не подключён"}; Model
                          Router: {item.routerPolicyVersion ?? "Не подключён"}
                        </div>
                        <div>
                          Тарифы:{" "}
                          {Object.values(item.priceReferences).join(", ") ||
                            "Отсутствуют"}
                        </div>
                      </>
                    )}
                  </details>
                </td>
                <td>
                  {item.model ?? "Не подтверждена"}
                  <br />
                  {usageSourceLabels[item.source] ?? item.source}
                </td>
                <td>
                  {item.agentProfileKey ?? "Без профиля агента"}
                  {item.workflowKey && (
                    <div className={styles.cellNote}>{item.workflowKey}</div>
                  )}
                </td>
                <td>
                  {usageOutcomeLabels[item.outcome]}
                  {item.coverage !== "turn" && (
                    <div className={styles.muted}>Неполное измерение</div>
                  )}
                </td>
                <td>
                  Всего: {item.tokens.totalTokens ?? "—"}
                  <br />
                  Вход: {item.tokens.inputTokens ?? "—"}
                  <br />
                  Кеш: {item.tokens.cachedInputTokens ?? "—"}
                  <br />
                  Выход: {item.tokens.outputTokens ?? "—"}
                </td>
                <td>
                  {formatUsageMoney(
                    item.customerCost.amountNanos,
                    item.customerCost.currency ?? "",
                  )}
                  <div className={styles.muted}>
                    {item.customerCost.state === "reconciled"
                      ? "Подтверждено"
                      : item.customerCost.state === "estimated"
                        ? "Оценка"
                        : "Нет расчёта"}
                  </div>
                </td>
                {"providerCost" in item && (
                  <td>
                    Модель:{" "}
                    {formatUsageMoney(
                      item.providerCost.amountNanos,
                      item.providerCost.currency ?? "",
                    )}
                    <br />
                    Инфраструктура:{" "}
                    {formatUsageMoney(
                      item.infrastructureCost.amountNanos,
                      item.infrastructureCost.currency ?? "",
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.items.length && <p>Расходов по этим фильтрам ещё нет.</p>}
    </UiSurface>
  );
}
