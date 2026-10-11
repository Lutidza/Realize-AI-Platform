/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageInsights.component.tsx
 * @version 1.0.0
 * @date 2026-10-05
 * @description Связывает сигналы расходов с конкретными действиями; не обещает автоматической экономии.
 */
import { ArrowUpRight, CircleCheck, Lightbulb } from "lucide-react";
import { UiBadge, UiButton, UiSurface } from "@realize/ui-kit";
import type { UsageAnalysisProps } from "./UsageAnalytics.types";
import { deriveUsageInsights } from "./deriveUsageAnalytics.service";
import styles from "./Usage.module.css";

export function UsageInsights({
  data,
  selection,
  onNavigate,
  compact = false,
}: UsageAnalysisProps & { compact?: boolean }) {
  const insights = deriveUsageInsights(data, selection);
  return (
    <section className={styles.stack} aria-label="Рекомендации по оптимизации">
      <div className={styles.sectionHeader}>
        <div>
          <h2>Возможности оптимизации</h2>
          <p className={styles.muted}>
            Сигналы по выбранному периоду · решения остаются под вашим контролем
          </p>
        </div>
        {compact && (
          <UiButton variant="ghost" onClick={() => onNavigate("optimization")}>
            Все рекомендации <ArrowUpRight size={16} aria-hidden />
          </UiButton>
        )}
      </div>
      <div className={styles.insights}>
        {insights.slice(0, compact ? 3 : undefined).map((insight) => (
          <UiSurface key={insight.id} className={styles.insight}>
            <div className={styles.sectionHeader}>
              <span className={styles.insightIcon} data-tone={insight.tone}>
                {insight.tone === "positive" ? (
                  <CircleCheck size={20} aria-hidden />
                ) : (
                  <Lightbulb size={20} aria-hidden />
                )}
              </span>
              <UiBadge
                accent={
                  insight.tone === "attention"
                    ? "amber"
                    : insight.tone === "positive"
                      ? "green"
                      : "purple"
                }
              >
                {insight.value}
              </UiBadge>
            </div>
            <h3>{insight.title}</h3>
            <p>{insight.detail}</p>
            <UiButton
              variant="ghost"
              onClick={() => onNavigate(insight.tab, insight.filters)}
            >
              {insight.actionLabel}
              <ArrowUpRight size={16} aria-hidden />
            </UiButton>
          </UiSurface>
        ))}
      </div>
    </section>
  );
}
