/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageGroups.component.tsx
 * @version 1.2.0
 * @date 2026-10-06
 * @description Сравнивает модели, процессы и агентов по всем агрегатам периода и ведёт к отфильтрованным операциям.
 */
"use client";
import { useState } from "react";
import { ArrowUpRight, Cpu } from "lucide-react";
import { UiBadge, UiButton, UiSelect, UiSurface } from "@realize/ui-kit";
import type { UsageAnalysisProps, UsageGrouping } from "./UsageAnalytics.types";
import {
  usageGroupingLabels,
  usageGroupingFilters,
} from "./usageLabels.config";
import { summarizeUsageCost } from "./deriveUsageAnalytics.service";
import {
  formatUsageAmount,
  formatUsageCount,
  observedUsageTokens,
  usageGroupLabel,
  usagePercent,
} from "./usageAnalyticsPresentation.util";
import { formatUsageMoney } from "./usageMoney.util";
import styles from "./Usage.module.css";

export function UsageGroups({
  data,
  selection,
  onNavigate,
}: UsageAnalysisProps) {
  const [group, setGroup] = useState<UsageGrouping>(
    data.view === "platform" ? "byPurpose" : "bySource",
  );
  const [expanded, setExpanded] = useState(false);
  const rows = [...data[group]].sort((a, b) => {
    const av = BigInt(
      observedUsageTokens(a.inputTokens, a.outputTokens) ?? "0",
    );
    const bv = BigInt(
      observedUsageTokens(b.inputTokens, b.outputTokens) ?? "0",
    );
    return av === bv ? a.key.localeCompare(b.key) : av > bv ? -1 : 1;
  });
  const tokens = rows.reduce(
    (sum, row) =>
      sum +
      BigInt(observedUsageTokens(row.inputTokens, row.outputTokens) ?? "0"),
    BigInt(0),
  );
  return (
    <UiSurface className={styles.surface}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>На что уходят ресурсы</h2>
          <p className={styles.muted}>
            По всему периоду · сортировка по наблюдаемым токенам
          </p>
        </div>
        <label className={styles.compactControl}>
          <span className={styles.visuallyHidden}>Группировка</span>
          <UiSelect
            aria-label="Группировка"
            value={group}
            onChange={(event) => {
              setGroup(event.target.value as typeof group);
              setExpanded(false);
            }}
          >
            {Object.entries(usageGroupingLabels)
              .filter(
                ([key]) => key !== "byPurpose" || data.view === "platform",
              )
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </UiSelect>
        </label>
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Группа</th>
              <th>Операции</th>
              <th>Токены</th>
              <th>Расход</th>
              <th>Доля токенов</th>
              <th>
                <span className={styles.visuallyHidden}>Действие</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, expanded ? undefined : 8).map((row) => {
              const observed = observedUsageTokens(
                row.inputTokens,
                row.outputTokens,
              );
              const share = usagePercent(observed, tokens.toString());
              const cost = summarizeUsageCost(
                row.amounts,
                row.attempts,
                row.modelAttempts,
                selection,
              );
              const filterKey = usageGroupingFilters[group];
              return (
                <tr key={row.key}>
                  <th scope="row">
                    <div className={styles.groupName}>
                      <span className={styles.groupIcon}>
                        <Cpu size={16} aria-hidden />
                      </span>
                      <span>{usageGroupLabel(row.key, group)}</span>
                    </div>
                  </th>
                  <td className={styles.number}>
                    {formatUsageCount(row.attempts)}{" "}
                    {row.failed > 0 && (
                      <UiBadge accent="rose">Ошибки: {row.failed}</UiBadge>
                    )}
                  </td>
                  <td
                    className={styles.number}
                    title={formatUsageCount(observed)}
                  >
                    {formatUsageCount(observed, true)}
                    {row.unknownTokenAttempts > 0 && (
                      <span className={styles.cellNote}>Известная часть</span>
                    )}
                  </td>
                  <td
                    className={styles.number}
                    title={formatUsageMoney(
                      cost.amountNanos,
                      selection.currency ?? "",
                    )}
                  >
                    {cost.amountNanos === null
                      ? "Не рассчитано"
                      : formatUsageAmount(cost.amountNanos, selection.currency)}
                    {cost.unknown > 0 && (
                      <span className={styles.cellNote}>
                        Без оценки: {cost.unknown}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className={styles.share}>
                      <progress
                        className={styles.progress}
                        max={100}
                        value={share ?? 0}
                        aria-label={
                          "Доля токенов: " + usageGroupLabel(row.key, group)
                        }
                      />
                      <span>
                        {share === null
                          ? "—"
                          : share.toLocaleString("ru-RU") + "%"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <UiButton
                      variant="ghost"
                      size="icon"
                      aria-label={
                        "Показать операции: " + usageGroupLabel(row.key, group)
                      }
                      onClick={() =>
                        onNavigate("operations", { [filterKey]: row.key })
                      }
                    >
                      <ArrowUpRight size={17} aria-hidden />
                    </UiButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className={styles.emptyText}>
          За выбранный период нет данных для сравнения.
        </p>
      )}
      {rows.length > 8 && (
        <UiButton
          variant="ghost"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded
            ? "Показать первые 8"
            : "Показать все группы (" + rows.length + ")"}
        </UiButton>
      )}
    </UiSurface>
  );
}
