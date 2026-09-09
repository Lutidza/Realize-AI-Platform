/**
 * @file packages/payload-ai-plugin/src/admin/integrations/IntegrationsClient.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Объединяет каталог интеграций с поиском и панелью выбранного подключения.
 */

"use client";

import type {
  IntegrationCatalogDTO,
  IntegrationProviderID,
} from "@realize/ai-contracts";
import { Blocks, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { GitHubIntegrationPanel } from "./GitHubIntegrationPanel.component";
import { IntegrationCatalog } from "./IntegrationCatalog";
import styles from "./IntegrationsPage.module.css";
import { useIntegrations } from "./useIntegrations";

/** Показывает настройки интеграций на основе безопасного DTO каталога. */
export const IntegrationsClient = ({
  initialCatalog,
}: {
  initialCatalog: IntegrationCatalogDTO;
}) => {
  const controller = useIntegrations(initialCatalog);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<IntegrationProviderID>("github");
  const github = controller.catalog?.connections.find(
    (connection) => connection.provider === "github",
  );

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageIdentity}>
          <span className={styles.pageIcon}>
            <Blocks aria-hidden="true" size={26} />
          </span>
          <div>
            <p className={styles.eyebrow}>Settings · Integrations</p>
            <h1>Интеграции</h1>
            <p>
              Единое место для внешних сервисов. Подключения разделены по
              providers, capabilities и собственным security boundaries.
            </p>
          </div>
        </div>
        <div className={styles.headerMeta}>
          <span>
            <ShieldCheck aria-hidden="true" size={16} />
            Secrets server-side
          </span>
          <button
            aria-label="Обновить интеграции"
            disabled={Boolean(controller.busyAction)}
            onClick={() => void controller.reload()}
            type="button"
          >
            <RefreshCw
              className={
                controller.busyAction === "load" ? styles.spinner : undefined
              }
              size={17}
            />
          </button>
        </div>
      </header>

      {controller.error ? (
        <div className={styles.errorBanner} role="alert">
          <span>{controller.error}</span>
          <button onClick={controller.clearError} type="button">
            Закрыть
          </button>
        </div>
      ) : null}

      {!controller.catalog && controller.busyAction === "load" ? (
        <div className={styles.loadingSurface} aria-live="polite">
          <Loader />
          <span>Загружаем каталог интеграций…</span>
        </div>
      ) : controller.catalog ? (
        <div className={styles.workspace}>
          <IntegrationCatalog
            connections={controller.catalog.connections}
            onSelect={setSelected}
            providers={controller.catalog.providers}
            search={search}
            selected={selected}
            setSearch={setSearch}
          />
          {selected === "github" ? (
            <GitHubIntegrationPanel
              busyAction={controller.busyAction}
              connection={github}
              onDisconnect={controller.disconnectGitHub}
              onSave={controller.saveGitHub}
              onTest={controller.testGitHub}
              vaultConfigured={controller.catalog.vaultConfigured}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

const Loader = () => (
  <span className={styles.loadingIcon}>
    <RefreshCw className={styles.spinner} size={22} />
  </span>
);
