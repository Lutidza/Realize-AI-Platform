/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchObservationPeriod.component.tsx
 * @version 1.0.0
 * @date 2026-11-03
 * @description Показывает единый период диагностики и способ сравнения в компонентах UI kit.
 */
"use client";
import { UiButton, UiDatePicker, UiNotice, UiSelect } from "@realize/ui-kit";
import type { SearchObservationPeriodProps } from "./SearchObservations.types";
import { useSearchObservationPeriod } from "./useSearchObservationPeriod.hook";
import styles from "./SearchObservations.module.css";

export function SearchObservationPeriod(props: SearchObservationPeriodProps) {
  const period = useSearchObservationPeriod(props);
  return (
    <form
      className={styles.period}
      aria-label="Период диагностики"
      onSubmit={(event) => {
        event.preventDefault();
        period.apply();
      }}
    >
      <div className={styles.filters}>
        <label>
          Период
          <UiSelect
            value={period.preset}
            onChange={(event) => period.setPreset(event.target.value)}
          >
            <option value="1">Последний час</option>
            <option value="24">Последние 24 часа</option>
            <option value="168">Последние 7 дней</option>
            <option value="custom">Произвольный диапазон</option>
          </UiSelect>
        </label>
        <label>
          Сравнение
          <UiSelect
            value={period.comparison}
            onChange={(event) => period.setComparison(event.target.value)}
          >
            <option value="halves">Половины периода</option>
            <option value="moment">До и после изменения</option>
          </UiSelect>
        </label>
      </div>
      {period.preset === "custom" && (
        <UiDatePicker
          key={`range-${period.resetKey}`}
          label="Диапазон дат"
          mode="range"
          withTime
          required
          startLabel="Начало периода"
          endLabel="Конец периода"
          value={period.range}
          onChange={period.setRange}
          maxDate={new Date()}
          describedBy="search-period-help"
          invalid={Boolean(period.error)}
        />
      )}
      {period.comparison === "moment" && (
        <UiDatePicker
          key={`moment-${period.resetKey}`}
          label="Момент изменения"
          withTime
          required
          value={period.moment}
          onChange={period.setMoment}
          maxDate={new Date()}
          describedBy="search-period-help"
          invalid={Boolean(period.error)}
        />
      )}
      <p id="search-period-help" className={styles.muted}>
        Часовой пояс: {period.timezone}. Конец диапазона не включён. Подробная
        история — до 7 дней.
        {period.comparison === "moment"
          ? " Сравниваются равные окна до и после момента изменения."
          : " Сравниваются первая и вторая половины периода."}
      </p>
      <div className={styles.actions}>
        <UiButton type="submit">Применить период</UiButton>
        <UiButton type="button" variant="secondary" onClick={period.reset}>
          Сбросить период
        </UiButton>
      </div>
      {period.error && (
        <UiNotice tone="danger" role="alert">
          {period.error}
        </UiNotice>
      )}
    </form>
  );
}
