/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageEfficiency.component.tsx
 * @version 1.0.0
 * @date 2026-10-05
 * @description Показывает завершение model attempts и измеренное использование кеша без подмены успеха задач.
 */
import { UiButton, UiSurface } from "@realize/ui-kit";
import { CircleCheck, ArrowUpRight } from "lucide-react";
import type { UsageAnalysisProps } from "./UsageAnalytics.types";
import {
  formatUsageCount,
  usagePercent,
} from "./usageAnalyticsPresentation.util";
import styles from "./Usage.module.css";

export function UsageEfficiency({
  data,
  onNavigate,
}: Pick<UsageAnalysisProps, "data" | "onNavigate">) {
  const current = data.analytics.current;
  const finished = current.completed + current.failed + current.cancelled;
  const rows = [
    {
      label: "Завершены без ошибки",
      value: usagePercent(current.completed, finished),
      detail: `Без ошибки: ${current.completed} из ${finished}`,
      tone: "success",
    },
    {
      label: "Вход из кеша",
      value: usagePercent(current.cachedInputTokens, current.cacheInputTokens),
      detail: `Измерено вызовов: ${current.cacheMeasuredAttempts}`,
      tone: "primary",
    },
    {
      label: "Полнота измерения токенов",
      value: usagePercent(
        current.modelAttempts - current.unknownTokenAttempts,
        current.modelAttempts,
      ),
      detail: `${current.unknownTokenAttempts} неполных измерений`,
      tone: "secondary",
    },
  ];
  return (
    <UiSurface className={`${styles.surface} ${styles.efficiency}`}>
      <div className={styles.sectionHeader}>
        <h2>Эффективность</h2>
        <CircleCheck size={20} aria-hidden className={styles.muted} />
      </div>
      <div className={styles.stack}>
        {rows.map((row) => (
          <div className={styles.efficiencyRow} key={row.label}>
            <div>
              <span>{row.label}</span>
              <strong>
                {row.value === null
                  ? "—"
                  : `${row.value.toLocaleString("ru-RU")}%`}
              </strong>
            </div>
            <progress
              aria-label={row.label}
              max={100}
              value={row.value ?? 0}
              data-tone={row.tone}
              className={styles.progress}
            />
            <p className={styles.muted}>{row.detail}</p>
          </div>
        ))}
      </div>
      <p className={styles.muted}>
        Успех вызова и качество готовой задачи оцениваются отдельно.
        Подтверждённых preview:{" "}
        {formatUsageCount(data.verifiedTasks.successfulTasks)}.
      </p>
      <UiButton variant="ghost" onClick={() => onNavigate("optimization")}>
        Возможности оптимизации <ArrowUpRight size={16} aria-hidden />
      </UiButton>
    </UiSurface>
  );
}
