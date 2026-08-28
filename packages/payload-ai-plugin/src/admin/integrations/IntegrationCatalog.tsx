/**
 * @file packages/payload-ai-plugin/src/admin/integrations/IntegrationCatalog.tsx
 * @version 2026-08-27
 * @description Renders a searchable provider catalog independent of provider forms.
 */

"use client";

import type {
  IntegrationConnectionDTO,
  IntegrationProviderDescriptorDTO,
  IntegrationProviderID,
} from "@realize/ai-contracts";
import { GitFork, Search } from "lucide-react";

import styles from "./IntegrationCatalog.module.css";

type IntegrationCatalogProps = {
  connections: IntegrationConnectionDTO[];
  onSelect: (provider: IntegrationProviderID) => void;
  providers: IntegrationProviderDescriptorDTO[];
  search: string;
  selected: IntegrationProviderID;
  setSearch: (value: string) => void;
};

/** Filters safe descriptors and shows connection state without provider secrets. */
export const IntegrationCatalog = ({
  connections,
  onSelect,
  providers,
  search,
  selected,
  setSearch,
}: IntegrationCatalogProps) => {
  const query = search.trim().toLocaleLowerCase("ru");
  const filtered = providers.filter((provider) =>
    `${provider.name} ${provider.description} ${provider.category}`
      .toLocaleLowerCase("ru")
      .includes(query),
  );

  return (
    <aside className={styles.catalog} aria-label="Каталог интеграций">
      <div className={styles.catalogHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Каталог</p>
          <h2>Подключения</h2>
        </div>
        <span className={styles.countBadge}>{providers.length}</span>
      </div>
      <label className={styles.searchField}>
        <Search aria-hidden="true" size={17} />
        <span className={styles.visuallyHidden}>Найти интеграцию</span>
        <input
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Найти интеграцию"
          type="search"
          value={search}
        />
      </label>
      <div className={styles.providerList}>
        {filtered.map((provider) => {
          const connection = connections.find(
            (item) => item.provider === provider.id,
          );
          const connected = Boolean(connection?.hasCredential);
          return (
            <button
              aria-pressed={selected === provider.id}
              className={`${styles.providerCard} ${
                selected === provider.id ? styles.providerCardSelected : ""
              }`}
              key={provider.id}
              onClick={() => onSelect(provider.id)}
              type="button"
            >
              <span className={styles.providerIcon}>
                <GitFork aria-hidden="true" size={22} />
              </span>
              <span className={styles.providerCopy}>
                <span className={styles.providerTitleRow}>
                  <strong>{provider.name}</strong>
                  <span
                    className={`${styles.connectionDot} ${
                      connected ? styles.connectionDotActive : ""
                    }`}
                  />
                </span>
                <span>{provider.description}</span>
                <small>{connected ? "Подключено" : "Не настроено"}</small>
              </span>
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <p className={styles.emptySearch}>Интеграции не найдены.</p>
        ) : null}
      </div>
      <p className={styles.catalogHint}>
        Новые providers добавляются в общий registry и автоматически появляются
        в каталоге.
      </p>
    </aside>
  );
};
