/**
 * @file packages/payload-ai-plugin/src/admin/usage/deriveUsageAnalytics.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Выводит полноту денежной оценки и приоритетные действия из разрешённых агрегатов всего периода.
 */
import type { UsageAmountDto } from "@realize/ai-contracts";
import type {
  UsageCostSelection,
  UsageCostSummary,
  UsageInsight,
} from "./UsageAnalytics.types";
import type { UsagePageData } from "./UsageView.types";
import {
  formatUsageAmount,
  formatUsageCount,
  usagePercent,
} from "./usageAnalyticsPresentation.util";

/** Известная стоимость сегмента: только выбранные валюта и основание. */
function knownCostDetail(
  amounts: UsageAmountDto[],
  selection: UsageCostSelection,
): string {
  const selected = amounts.filter(
    (amount) =>
      amount.basis === selection.basis &&
      amount.currency === selection.currency,
  );
  if (!selected.length) return "";
  const nanos = selected
    .reduce((sum, amount) => sum + BigInt(amount.amountNanos), BigInt(0))
    .toString();
  return ` Их известная стоимость — ${formatUsageAmount(nanos, selection.currency)}.`;
}

/** Число оценок считается по всем валютам основания; сумма — только по выбранной валюте. */
export function summarizeUsageCost(
  amounts: UsageAmountDto[],
  attempts: number,
  modelAttempts: number,
  selection: UsageCostSelection,
): UsageCostSummary {
  const applicable =
    selection.basis === "infrastructure" ? attempts : modelAttempts;
  const basisAmounts = amounts.filter(
    (amount) => amount.basis === selection.basis,
  );
  const priced = basisAmounts.reduce(
    (count, amount) => count + amount.estimated + amount.reconciled,
    0,
  );
  const unknown = Math.max(0, applicable - priced);
  const selected = basisAmounts.filter(
    (amount) => amount.currency === selection.currency,
  );
  const amountNanos = selected.length
    ? selected
        .reduce((sum, amount) => sum + BigInt(amount.amountNanos), BigInt(0))
        .toString()
    : unknown === 0 && selection.currency !== null
      ? "0"
      : null;
  return {
    amountNanos,
    priced,
    applicable,
    unknown,
    state:
      applicable === 0
        ? "empty"
        : unknown === 0
          ? "complete"
          : amountNanos === null
            ? "unknown"
            : "partial",
  };
}

export function deriveUsageInsights(
  data: UsagePageData,
  selection: UsageCostSelection,
): UsageInsight[] {
  const metrics = data.analytics.current;
  const cost = summarizeUsageCost(
    data.amounts,
    data.summary.attempts,
    metrics.modelAttempts,
    selection,
  );
  const insights: UsageInsight[] = [];
  if (cost.unknown > 0)
    insights.push({
      id: "pricing",
      tone: "attention",
      title: "Восстановите полноту расходов",
      value: `${formatUsageCount(cost.unknown)} без оценки`,
      detail:
        data.view === "platform"
          ? "Для части операций не хватает тарифа или измерений. Проверьте цены и выполните сверку, чтобы видеть полную стоимость."
          : "Для части операций ещё нет денежной оценки. Уточните тариф и полноту учёта у владельца платформы.",
      actionLabel:
        data.view === "platform" ? "Тарифы и сверка" : "Открыть операции",
      tab: data.view === "platform" ? "pricing" : "operations",
    });
  const unsuccessful = metrics.failed + metrics.cancelled;
  if (unsuccessful > 0) {
    insights.push({
      id: "failures",
      tone: "attention",
      title: "Разберите неуспешные вызовы",
      value: `${formatUsageCount(unsuccessful)} из ${formatUsageCount(metrics.modelAttempts)}`,
      detail: `Ошибки: ${metrics.failed}, отмены: ${metrics.cancelled}.${knownCostDetail(data.analytics.unsuccessfulAmounts, selection)} Проверьте контекст и причины отказов перед повторным запуском.`,
      actionLabel: metrics.failed ? "Показать ошибки" : "Показать отмены",
      tab: "operations",
      filters: { outcome: metrics.failed ? "failed" : "cancelled" },
    });
  }
  if (metrics.retries > 0)
    insights.push({
      id: "retries",
      tone: "attention",
      title: "Сократите повторные попытки",
      value: `Повторы: ${formatUsageCount(metrics.retries)}`,
      detail: `Сопоставьте попытки одной операции в журнале.${knownCostDetail(data.analytics.retryAmounts, selection)} Часть повторов необходима для восстановления и не является гарантированной экономией.`,
      actionLabel: "Проверить журнал",
      tab: "operations",
    });
  const budget = data.budgets.find(
    (item) =>
      item.exceeded || item.unresolvedAttempts > 0 || item.unfundedAttempts > 0,
  );
  if (budget)
    insights.push({
      id: "budget-alert",
      tone: "attention",
      title: budget.exceeded
        ? "Бюджет требует внимания"
        : "Проверьте резервы бюджета",
      value: budget.exceeded ? "Лимит превышен" : "Есть незакрытые попытки",
      detail:
        "Проверьте учтённые расходы, открытые резервы и операции без резерва до увеличения лимита.",
      actionLabel: "Открыть бюджеты",
      tab: "budgets",
    });
  else if (!data.budgets.length)
    insights.push({
      id: "budget",
      tone: "neutral",
      title: "Задайте месячный бюджет",
      value: "Лимит не настроен",
      detail:
        "Мягкий лимит помогает следить за расходом. Жёсткий допуск требует измеряемой стоимости и резерва на запуск.",
      actionLabel: "Настроить бюджет",
      tab: "budgets",
    });
  const cache = usagePercent(
    metrics.cachedInputTokens,
    metrics.cacheInputTokens,
  );
  if (cache !== null)
    insights.push({
      id: "cache",
      tone: cache >= 50 ? "positive" : "neutral",
      title: "Повторно используйте стабильный контекст",
      value: `${cache.toLocaleString("ru-RU")}% входа из кеша`,
      detail: `Измерено вызовов: ${formatUsageCount(metrics.cacheMeasuredAttempts)}. Стабильные инструкции и общий префикс могут улучшить повторное использование; доступность и цена кеша зависят от модели.`,
      actionLabel: "Сравнить модели",
      tab: "overview",
    });
  if (!insights.length)
    insights.push({
      id: "observe",
      tone: "positive",
      title: "Начните с измеренного результата",
      value: metrics.modelAttempts ? "Явных сигналов нет" : "Пока нет запусков",
      detail:
        "Сравнивайте стоимость моделей на одинаковых задачах вместе с качеством и задержкой. Автоматическая смена модели здесь не выполняется.",
      actionLabel: "Открыть обзор",
      tab: "overview",
    });
  return insights;
}
