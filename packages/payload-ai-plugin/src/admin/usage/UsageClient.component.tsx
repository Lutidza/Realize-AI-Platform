/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageClient.component.tsx
 * @version 1.2.0
 * @date 2026-10-06
 * @description Организует аналитический дашборд и его вкладки поверх авторизованного ledger DTO.
 */
"use client";
import { useState } from "react";
import Link from "next/link.js";
import {
  Activity,
  ChartNoAxesCombined,
  Clock3,
  Lightbulb,
  ListFilter,
  RefreshCw,
  Settings2,
  WalletCards,
} from "lucide-react";
import {
  UiBadge,
  UiButton,
  UiNotice,
  UiSelect,
  UiSurface,
  UiTabs,
} from "@realize/ui-kit";
import type { UsageCostBasis } from "@realize/ai-contracts";
import { AdminUiTheme } from "../AdminUiTheme.component";
import type { UsageClientProps } from "./UsageView.types";
import type {
  UsageCostSelection,
  UsageNavigate,
  UsageTab,
} from "./UsageAnalytics.types";
import { useUsageDashboard } from "./useUsageDashboard.hook";
import { UsageMetrics } from "./UsageMetrics.component";
import { UsageTrend } from "./UsageTrend.component";
import { UsageEfficiency } from "./UsageEfficiency.component";
import { UsageFilters } from "./UsageFilters.component";
import { UsageInsights } from "./UsageInsights.component";
import { UsageAttempts } from "./UsageAttempts.component";
import { UsageGroups } from "./UsageGroups.component";
import { UsageBudgets } from "./UsageBudgets.component";
import { UsagePricing } from "./UsagePricing.component";
import { UsageVerifiedResults } from "./UsageVerifiedResults.component";
import { usageBasisLabels } from "./usageLabels.config";
import styles from "./Usage.module.css";

export function UsageClient({ apiUrl, platform, switchUrl }: UsageClientProps) {
  const history = useUsageDashboard(apiUrl);
  const [tab, setTab] = useState<UsageTab>("overview");
  const [basis, setBasis] = useState<UsageCostBasis>(
    platform ? "provider" : "customer",
  );
  const [currency, setCurrency] = useState<string | null>(null);
  const data = history.data;
  const currencies = [
    ...new Set(
      data?.amounts
        .filter((amount) => amount.basis === basis)
        .map((amount) => amount.currency) ?? [],
    ),
  ].sort();
  const selection: UsageCostSelection = {
    basis,
    currency:
      currency && currencies.includes(currency)
        ? currency
        : (currencies[0] ?? null),
  };
  const onNavigate: UsageNavigate = (next, filters) => {
    if (filters) history.patchFilters(filters);
    setTab(next);
  };
  const analysis = data ? { data, selection, onNavigate } : null;
  return (
    <AdminUiTheme>
      <main className={styles.page}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <div className={styles.eyebrow}>
              <ChartNoAxesCombined size={16} aria-hidden /> Аналитика{" "}
              <span>/</span> Искусственный интеллект
            </div>
            <h1>{platform ? "Расходы платформы" : "Расходы ИИ"}</h1>
            <p className={styles.muted}>
              {platform
                ? "Контроль себестоимости, использования и эффективности ИИ"
                : "Использование ИИ, стоимость и возможности оптимизации"}
            </p>
            <div className={styles.scope}>
              <UiBadge accent={platform ? "purple" : "blue"} dot>
                {platform ? "Владелец платформы" : "Моя установка"}
              </UiBadge>
              {switchUrl && (
                <Link href={switchUrl} className={styles.textLink}>
                  {platform
                    ? "Расходы моей установки"
                    : "Аналитика владельца платформы"}
                </Link>
              )}
            </div>
          </div>
          <div className={styles.toolbar}>
            <label>
              <span className={styles.visuallyHidden}>Период</span>
              <UiSelect
                aria-label="Период"
                value={history.filters.days}
                onChange={(event) => history.filter("days", event.target.value)}
              >
                <option value="7">Последние 7 дней</option>
                <option value="30">Последние 30 дней</option>
                <option value="90">Последние 90 дней</option>
                <option value="366">Последний год</option>
              </UiSelect>
            </label>
            <UiButton
              variant="secondary"
              disabled={history.loading}
              onClick={history.refresh}
            >
              <RefreshCw size={16} aria-hidden /> Обновить
            </UiButton>
          </div>
        </header>
        <UsageFilters
          filters={history.filters}
          options={history.filterOptions}
          onChange={history.filter}
          onReset={history.resetFilters}
          platform={platform}
        />
        {history.loading && (
          <div className={styles.loading} role="status" aria-live="polite">
            <div className={styles.skeletonMetrics}>
              {[0, 1, 2, 3].map((n) => (
                <div key={n} />
              ))}
            </div>
            <p>Загрузка аналитики…</p>
          </div>
        )}
        {history.error && (
          <UiNotice tone="danger" role="alert">
            {history.error}{" "}
            <UiButton variant="ghost" onClick={history.refresh}>
              Повторить загрузку
            </UiButton>
          </UiNotice>
        )}
        {data && analysis && (
          <>
            <div className={styles.measurementToolbar}>
              <div className={styles.scope}>
                {platform && (
                  <label>
                    <span className={styles.visuallyHidden}>
                      Основание расходов
                    </span>
                    <UiSelect
                      aria-label="Основание расходов"
                      value={basis}
                      onChange={(event) =>
                        setBasis(event.target.value as UsageCostBasis)
                      }
                    >
                      {["provider", "customer", "infrastructure"].map(
                        (value) => (
                          <option key={value} value={value}>
                            {usageBasisLabels[value]}
                          </option>
                        ),
                      )}
                    </UiSelect>
                  </label>
                )}
                {currencies.length > 0 && (
                  <label>
                    <span className={styles.visuallyHidden}>Валюта</span>
                    <UiSelect
                      aria-label="Валюта"
                      value={selection.currency ?? ""}
                      onChange={(event) => setCurrency(event.target.value)}
                    >
                      {currencies.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </UiSelect>
                  </label>
                )}
              </div>
              <p className={styles.updated}>
                <Clock3 size={14} aria-hidden /> Обновлено{" "}
                {new Date(data.generatedAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <UsageMetrics {...analysis} />
            <UiTabs
              label="Разделы аналитики"
              appearance="underline"
              value={tab}
              onValueChange={(value) => setTab(value as UsageTab)}
              items={[
                {
                  id: "overview",
                  label: "Обзор",
                  icon: <Activity size={16} aria-hidden />,
                  content: (
                    <div className={styles.tabContent}>
                      {data.summary.attempts === 0 && (
                        <UiSurface className={styles.empty}>
                          <ChartNoAxesCombined size={30} aria-hidden />
                          <h2>За этот период нет операций</h2>
                          <p>
                            Выберите другой период или сбросьте фильтры. Данные
                            появятся после запусков ИИ в вашей области доступа.
                          </p>
                          <UiButton
                            variant="secondary"
                            onClick={history.resetFilters}
                          >
                            Сбросить фильтры
                          </UiButton>
                        </UiSurface>
                      )}
                      <div className={styles.overviewGrid}>
                        <UsageTrend {...analysis} />
                        <UsageEfficiency {...analysis} />
                      </div>
                      <UsageGroups {...analysis} />
                      <UsageInsights {...analysis} compact />
                    </div>
                  ),
                },
                {
                  id: "optimization",
                  label: "Оптимизация",
                  icon: <Lightbulb size={16} aria-hidden />,
                  content: (
                    <div className={styles.tabContent}>
                      <UsageInsights {...analysis} />
                      <UsageVerifiedResults data={data} />
                    </div>
                  ),
                },
                {
                  id: "operations",
                  label: "Операции",
                  icon: <ListFilter size={16} aria-hidden />,
                  content: (
                    <div className={styles.tabContent}>
                      <UsageAttempts data={data} />
                      <div className={styles.actions}>
                        <UiButton
                          variant="secondary"
                          disabled={!data.nextCursor}
                          onClick={history.next}
                        >
                          Более ранние попытки
                        </UiButton>
                        {history.cursor && (
                          <UiButton variant="ghost" onClick={history.refresh}>
                            К новым попыткам
                          </UiButton>
                        )}
                      </div>
                    </div>
                  ),
                },
                {
                  id: "budgets",
                  label: "Бюджеты",
                  icon: <WalletCards size={16} aria-hidden />,
                  content: (
                    <div className={styles.tabContent}>
                      <UsageBudgets
                        data={data}
                        apiUrl={apiUrl}
                        onSaved={history.refresh}
                      />
                    </div>
                  ),
                },
                ...(data.view === "platform"
                  ? [
                      {
                        id: "pricing",
                        label: "Тарифы и сверка",
                        icon: <Settings2 size={16} aria-hidden />,
                        content: (
                          <div className={styles.tabContent}>
                            <UsagePricing
                              data={data}
                              apiUrl={apiUrl}
                              onSaved={history.refresh}
                            />
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            <footer className={styles.footer}>
              <details>
                <summary>Об учёте и полноте данных</summary>
                <p>
                  Суммы рассчитаны по сохранённым тарифам и не являются счётом
                  на оплату. Валюты и основания расходов учитываются отдельно.
                  Неизвестная цена не означает нулевую стоимость. Сравнение
                  использует предыдущий равный период с теми же фильтрами.
                </p>
                <p>
                  Учитываются зарегистрированные вызовы платформы, проверки и
                  запуск preview. Внешние IDE-сессии и внутренние повторы
                  провайдера автоматически не измеряются. Измерения дочерних и
                  продолженных сессий могут быть неполными. Дальнейшая работа
                  preview и хранение пока не входят в инфраструктурную оценку.
                </p>
              </details>
            </footer>
          </>
        )}
      </main>
    </AdminUiTheme>
  );
}
