/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageBudgets.component.tsx
 * @version 1.0.0
 * @date 2026-10-05
 * @description Визуализирует месячный расход и резервы, сохраняя существующую форму атомарного бюджета.
 */
import { UiBadge, UiNotice, UiSurface } from "@realize/ui-kit";
import { WalletCards } from "lucide-react";
import type { UsageFormProps } from "./UsageView.types";
import { UsageBudgetForm } from "./UsageBudgetForm.component";
import { usageBasisLabels, usagePurposeLabels } from "./usageLabels.config";
import {
  formatUsageAmount,
  usagePercent,
} from "./usageAnalyticsPresentation.util";
import { formatUsageMoney } from "./usageMoney.util";
import styles from "./Usage.module.css";

export function UsageBudgets(props: UsageFormProps) {
  const { data } = props;
  return (
    <section className={styles.stack}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Бюджеты и лимиты</h2>
          <p className={styles.muted}>
            Текущий календарный месяц UTC · фильтр модели не меняет бюджет
          </p>
        </div>
        <WalletCards size={22} aria-hidden className={styles.muted} />
      </div>
      <div className={styles.budgetGrid}>
        {data.budgets.map((budget) => {
          const policy = budget.policy;
          const used = usagePercent(
            (
              BigInt(budget.spentNanos) + BigInt(budget.reservedNanos)
            ).toString(),
            policy.limitNanos,
          );
          return (
            <UiSurface
              className={styles.surface}
              key={`${policy.installationId}:${policy.projectId}:${policy.purpose}:${policy.basis}`}
            >
              <div className={styles.sectionHeader}>
                <h3>
                  {data.view === "platform"
                    ? usageBasisLabels[policy.basis]
                    : "Бюджет установки"}
                </h3>
                <UiBadge accent={budget.exceeded ? "rose" : "purple"}>
                  {policy.mode === "hard"
                    ? "Жёсткий лимит"
                    : policy.mode === "soft"
                      ? "Мягкий лимит"
                      : "Без ограничений"}
                </UiBadge>
              </div>
              {data.view === "platform" && (
                <p className={styles.muted}>
                  {policy.installationId} / {policy.projectId} ·{" "}
                  {usagePurposeLabels[policy.purpose]}
                </p>
              )}
              <div className={styles.budgetAmount}>
                <strong
                  title={formatUsageMoney(budget.spentNanos, policy.currency)}
                >
                  {formatUsageAmount(budget.spentNanos, policy.currency)}
                </strong>
                <span>
                  из{" "}
                  {policy.limitNanos === null
                    ? "неограниченного бюджета"
                    : formatUsageAmount(policy.limitNanos, policy.currency)}
                </span>
              </div>
              <progress
                className={styles.progress}
                data-tone={budget.exceeded ? "danger" : "primary"}
                max={100}
                value={Math.min(100, used ?? 0)}
                aria-label={`Расход бюджета ${policy.installationId} ${policy.basis}`}
              />
              <div className={styles.budgetDetails}>
                <span>
                  Резерв{" "}
                  <strong>
                    {formatUsageAmount(budget.reservedNanos, policy.currency)}
                  </strong>
                </span>
                <span>
                  Остаток{" "}
                  <strong>
                    {budget.remainingNanos === null
                      ? "Без лимита"
                      : formatUsageAmount(
                          budget.remainingNanos,
                          policy.currency,
                        )}
                  </strong>
                </span>
              </div>
              {(budget.exceeded ||
                budget.unresolvedAttempts > 0 ||
                budget.unfundedAttempts > 0) && (
                <UiNotice tone={budget.exceeded ? "danger" : "neutral"}>
                  {budget.exceeded ? "Лимит превышен. " : ""}Требуют сверки:{" "}
                  {budget.unresolvedAttempts}. Без резерва:{" "}
                  {budget.unfundedAttempts}.
                </UiNotice>
              )}
            </UiSurface>
          );
        })}
      </div>
      {!data.budgets.length && (
        <UiSurface className={styles.empty}>
          <WalletCards size={30} aria-hidden />
          <h3>Месячный бюджет ещё не задан</h3>
          <p>
            Настройте лимит и резерв на попытку, чтобы контролировать новые
            расходы.
          </p>
        </UiSurface>
      )}
      <UiSurface className={styles.surface}>
        <UsageBudgetForm {...props} />
      </UiSurface>
    </section>
  );
}
