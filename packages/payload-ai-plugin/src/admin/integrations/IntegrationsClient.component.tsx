/**
 * @file packages/payload-ai-plugin/src/admin/integrations/IntegrationsClient.component.tsx
 * @version 1.1.1
 * @date 2026-09-09
 * @description Связывает состояние интеграций с каталогом или настройками провайдера.
 */

"use client";

import { AdminUiTheme } from "../AdminUiTheme.component";
import { IntegrationCatalog } from "./catalog/IntegrationCatalog.component";
import { GitHubIntegrationPanel } from "./GitHubIntegrationPanel.component";
import type { IntegrationsClientProps } from "./IntegrationsClient.types";
import { IntegrationsPageView } from "./IntegrationsPage.view";
import { useIntegrations } from "./useIntegrations.hook";

export const IntegrationsClient = ({
  catalogURL,
  initialCatalog,
  providerID,
}: IntegrationsClientProps) => {
  const state = useIntegrations(initialCatalog);
  const provider = state.catalog.providers.find(
    (item) => item.id === providerID,
  );

  return (
    <AdminUiTheme>
      <IntegrationsPageView
        catalogURL={catalogURL}
        heading={provider?.name ?? "Интеграции"}
        isSettings={Boolean(providerID)}
        state={state}
      >
        {providerID === "github" ? (
          <GitHubIntegrationPanel
            busyAction={state.busyAction}
            connection={state.catalog.connections.find(
              (item) => item.provider === "github",
            )}
            onDisconnect={state.disconnectGitHub}
            onSave={state.saveGitHub}
            onTest={state.testGitHub}
            vaultConfigured={state.catalog.vaultConfigured}
          />
        ) : (
          <IntegrationCatalog catalog={state.catalog} catalogURL={catalogURL} />
        )}
      </IntegrationsPageView>
    </AdminUiTheme>
  );
};
