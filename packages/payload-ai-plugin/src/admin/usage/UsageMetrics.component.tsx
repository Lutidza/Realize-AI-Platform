/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageMetrics.component.tsx
 * @version 1.0.0
 * @date 2026-10-05
 * @description Представляет стоимость, токены, число вызовов и latency с честным сравнением и покрытием.
 */
import { Coins, Cpu, Layers3, Timer } from "lucide-react";
import { UiSurface } from "@realize/ui-kit";
import type { UsageAnalysisProps } from "./UsageAnalytics.types";
import { summarizeUsageCost } from "./deriveUsageAnalytics.service";
import {
  formatUsageAmount,
  formatUsageCount,
  formatUsageDuration,
  observedUsageTokens,
  usageChange,
} from "./usageAnalyticsPresentation.util";
import { formatUsageMoney } from "./usageMoney.util";
import styles from "./Usage.module.css";

export function UsageMetrics({
  data,
  selection,
}: Pick<UsageAnalysisProps, "data" | "selection">) {
  const { current, previous } = data.analytics;
  const cost = summarizeUsageCost(
    data.amounts,
    data.summary.attempts,
    current.modelAttempts,
    selection,
  );
  const previousCost = summarizeUsageCost(
    previous.amounts,
    previous.attempts,
    previous.modelAttempts,
    selection,
  );
  const tokens = observedUsageTokens(current.inputTokens, current.outputTokens);
  const previousTokens = observedUsageTokens(
    previous.inputTokens,
    previous.outputTokens,
  );
  const cards = [
    {
      label:
        cost.state === "partial"
          ? "Известная часть расходов"
          : "Денежная оценка",
      value:
        cost.amountNanos === null
          ? "—"
          : formatUsageAmount(cost.amountNanos, selection.currency),
      title: formatUsageMoney(cost.amountNanos, selection.currency ?? ""),
      icon: Coins,
      note: cost.applicable
        ? `С ценой ${formatUsageCount(cost.priced)} из ${formatUsageCount(cost.applicable)} операций`
        : "Нет операций за этот период",
      change:
        cost.unknown === 0 && previousCost.unknown === 0
          ? usageChange(cost.amountNanos, previousCost.amountNanos)
          : null,
    },
    {
      label: "Наблюдаемые токены",
      value: formatUsageCount(tokens, true),
      title: formatUsageCount(tokens),
      icon: Layers3,
      note: current.unknownTokenAttempts
        ? `Неполных измерений: ${formatUsageCount(current.unknownTokenAttempts)}`
        : "Вход + выход · кеш уже входит во вход",
      change:
        current.unknownTokenAttempts === 0 &&
        previous.unknownTokenAttempts === 0
          ? usageChange(tokens, previousTokens)
          : null,
    },
    {
      label: "Вызовы модели",
      value: formatUsageCount(current.modelAttempts),
      title: `${data.summary.attempts} операций с учётом проверок и preview`,
      icon: Cpu,
      note: `Повторы: ${formatUsageCount(current.retries)} · задачи: ${formatUsageCount(data.summary.tasks)}`,
      change: usageChange(current.modelAttempts, previous.modelAttempts),
    },
    {
      label: "Задержка p95",
      value: formatUsageDuration(current.p95DurationMs),
      title: "95% измеренных завершённых вызовов не дольше этого значения",
      icon: Timer,
      note: `Медиана ${formatUsageDuration(current.p50DurationMs)} · измерений ${formatUsageCount(current.timedAttempts)}`,
      change: null,
    },
  ];
  return (
    <section className={styles.metrics} aria-label="Показатели расходов">
      {cards.map((card) => (
        <UiSurface key={card.label} className={styles.metricCard}>
          <div className={styles.metricLabel}>
            <span>{card.label}</span>
            <card.icon size={18} aria-hidden />
          </div>
          <strong className={styles.metricValue} title={card.title}>
            {card.value}
          </strong>
          <p className={styles.metricNote}>{card.note}</p>
          {card.change && (
            <p className={styles.metricComparison}>
              <span>{card.change}</span> к предыдущему периоду
            </p>
          )}
        </UiSurface>
      ))}
    </section>
  );
}
