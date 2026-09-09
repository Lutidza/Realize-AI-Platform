/**
 * @file packages/payload-ai-plugin/src/admin/integrations/catalog/IntegrationCatalog.view.tsx
 * @version 1.0.2
 * @date 2026-09-09
 * @description Отображает поиск, фильтры, сетку сервисов и пустую выдачу.
 */

"use client";

import { UiButton, UiInput } from "@realize/ui-kit";
import { Search, SearchX, X } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard.component";
import type { IntegrationCatalogViewProps } from "./IntegrationCatalog.types";
import { INTEGRATION_ACTIVITY_FILTERS } from "./integrationCatalog.constants";
import styles from "./IntegrationCatalog.module.css";

export const IntegrationCatalogView = ({
  catalogURL,
  catalogSize,
  filters,
}: IntegrationCatalogViewProps) => (
  <section aria-label="Каталог интеграций" className={styles.catalog}>
    <div className={styles.toolbar}>
      <div className={styles.search}>
        <Search aria-hidden="true" size={18} />
        <UiInput
          aria-label="Поиск интеграций"
          onChange={(event) => filters.setQuery(event.target.value)}
          placeholder="Поиск интеграций"
          type="search"
          value={filters.query}
        />
        {filters.query ? (
          <UiButton
            aria-label="Очистить поиск"
            onClick={() => filters.setQuery("")}
            size="icon"
            variant="ghost"
          >
            <X aria-hidden="true" size={16} />
          </UiButton>
        ) : null}
      </div>
      <div
        aria-label="Активность интеграций"
        className={styles.filters}
        role="group"
      >
        {INTEGRATION_ACTIVITY_FILTERS.map((filter) => (
          <UiButton
            aria-pressed={filters.activity === filter.value}
            key={filter.value}
            onClick={() => filters.setActivity(filter.value)}
            size="small"
            variant="ghost"
          >
            {filter.label}
          </UiButton>
        ))}
      </div>
    </div>
    <hr className={styles.separator} />
    <p aria-live="polite" className={styles.resultCount}>
      Показано: {filters.cards.length} из {catalogSize}
    </p>
    {filters.cards.length ? (
      <ul className={styles.grid}>
        {filters.cards.map((card) => (
          <IntegrationCard
            {...card}
            href={`${catalogURL.replace(/\/$/, "")}/${card.provider.id}`}
            key={card.provider.id}
          />
        ))}
      </ul>
    ) : (
      <div className={styles.empty}>
        <SearchX aria-hidden="true" size={30} />
        <h2>
          {catalogSize
            ? "Интеграции не найдены"
            : "Пока нет доступных интеграций"}
        </h2>
        <p>
          {catalogSize
            ? "Попробуйте другой запрос или измените фильтр."
            : "Доступные сервисы появятся здесь."}
        </p>
        {catalogSize ? (
          <UiButton onClick={filters.reset} variant="secondary">
            Сбросить фильтры
          </UiButton>
        ) : null}
      </div>
    )}
  </section>
);
