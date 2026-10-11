/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageFilters.component.tsx
 * @version 1.1.0
 * @date 2026-10-06
 * @description Раскрывает серверные фильтры по требованию, сохраняя область клиента и отдельные owner dimensions.
 */
import { SlidersHorizontal } from "lucide-react";
import {
  UiBadge,
  UiButton,
  UiInput,
  UiSelect,
  UiSurface,
} from "@realize/ui-kit";
import type { UsageFilters as Filters } from "./UsageView.types";
import type { UsageFilterOptionsDto } from "@realize/ai-contracts";
import { UsageGroupSelect } from "./UsageGroupSelect.component";
import {
  usageOutcomeLabels,
  usagePurposeLabels,
  usageSourceLabels,
} from "./usageLabels.config";
import styles from "./Usage.module.css";

export function UsageFilters({
  filters,
  onChange,
  onReset,
  platform,
  options,
}: {
  filters: Filters;
  options: UsageFilterOptionsDto | undefined;
  onChange: (key: keyof Filters, value: string) => void;
  onReset: () => void;
  platform: boolean;
}) {
  const active = Object.entries(filters).filter(
    ([key, value]) => key !== "days" && value !== "",
  ).length;
  return (
    <UiSurface className={styles.filterSurface}>
      <details className={styles.filters}>
        <summary>
          <SlidersHorizontal size={16} aria-hidden /> Фильтры{" "}
          {active > 0 && <UiBadge accent="purple">{active}</UiBadge>}
          <span className={styles.muted}>
            Модель, результат, операция и профиль
          </span>
        </summary>
        <div className={styles.filterBody}>
          <div className={styles.grid}>
            <UsageGroupSelect
              label="Модель"
              allLabel="Все модели"
              group="byModel"
              value={filters.model}
              options={options?.models ?? []}
              onChange={(value) => onChange("model", value)}
            />
            <label>
              Результат
              <UiSelect
                value={filters.outcome}
                onChange={(event) => onChange("outcome", event.target.value)}
              >
                <option value="">Все результаты</option>
                {Object.entries(usageOutcomeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </UiSelect>
            </label>
            <label>
              Тип работы
              <UiSelect
                value={filters.source}
                onChange={(event) => onChange("source", event.target.value)}
              >
                <option value="">Все операции</option>
                {Object.entries(usageSourceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </UiSelect>
            </label>
            <UsageGroupSelect
              label="Процесс"
              allLabel="Все процессы"
              group="byWorkflow"
              value={filters.workflowKey}
              options={options?.workflows ?? []}
              onChange={(value) => onChange("workflowKey", value)}
            />
            <UsageGroupSelect
              label="Админский агент"
              allLabel="Все агенты"
              group="byAgent"
              value={filters.agentProfileKey}
              options={options?.agents ?? []}
              onChange={(value) => onChange("agentProfileKey", value)}
            />
            {platform && (
              <>
                <label>
                  Установка
                  <UiInput
                    value={filters.installationId}
                    onChange={(event) =>
                      onChange("installationId", event.target.value)
                    }
                    placeholder="Все установки"
                  />
                </label>
                <label>
                  Назначение
                  <UiSelect
                    value={filters.purpose}
                    onChange={(event) =>
                      onChange("purpose", event.target.value)
                    }
                  >
                    <option value="">Все назначения</option>
                    {Object.entries(usagePurposeLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </UiSelect>
                </label>
                <label>
                  Проект
                  <UiInput
                    value={filters.projectId}
                    onChange={(event) =>
                      onChange("projectId", event.target.value)
                    }
                    placeholder="Все проекты"
                  />
                </label>
              </>
            )}
          </div>
          {platform && (
            <details className={styles.advancedFilters}>
              <summary>Версии системы и конфигурации</summary>
              <div className={styles.grid}>
                {(
                  [
                    ["systemReleaseId", "Системный выпуск"],
                    ["overlayReleaseId", "Админский выпуск"],
                    ["modelCatalogRevision", "Ревизия Model Garden"],
                    ["routerPolicyVersion", "Версия Model Router"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <UiInput
                      value={filters[key]}
                      onChange={(event) => onChange(key, event.target.value)}
                      placeholder="Все версии"
                    />
                  </label>
                ))}
              </div>
            </details>
          )}
          {active > 0 && (
            <div className={styles.actions}>
              <UiButton variant="ghost" size="small" onClick={onReset}>
                Сбросить фильтры
              </UiButton>
            </div>
          )}
        </div>
      </details>
    </UiSurface>
  );
}
