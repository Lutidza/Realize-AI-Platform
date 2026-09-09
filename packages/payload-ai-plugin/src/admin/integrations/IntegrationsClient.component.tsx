/**
 * @file packages/payload-ai-plugin/src/admin/integrations/IntegrationsClient.component.tsx
 * @version 1.2.0
 * @date 2026-09-09
 * @description Связывает состояние интеграций с каталогом или настройками провайдера.
 */

"use client";

import type { CodexIntegrationConnectionDTO } from "@realize/ai-contracts";
import { useCallback, useState } from "react";
import { AdminUiTheme } from "../AdminUiTheme.component";
import { IntegrationCatalog } from "./catalog/IntegrationCatalog.component";
import { GitHubIntegrationPanel } from "./GitHubIntegrationPanel.component";
import { CodexIntegrationPanel } from "./codex/CodexIntegrationPanel.component";
import type { IntegrationsClientProps } from "./IntegrationsClient.types";
import { IntegrationsPageView } from "./IntegrationsPage.view";
import { useIntegrations } from "./useIntegrations.hook";

export const IntegrationsClient = ({
  catalogURL,
  initialCatalog,
  providerID,
}: IntegrationsClientProps) => {
  const state = useIntegrations(initialCatalog);
  const [isCodexBusy, setCodexBusy] = useState(false);
  const { replaceConnection } = state;
  const replaceCodex = useCallback(
    (connection?: CodexIntegrationConnectionDTO) =>
      replaceConnection("codex", connection),
    [replaceConnection],
  );
  const provider = state.catalog.providers.find(
    (item) => item.id === providerID,
  );

  return (
    <AdminUiTheme>
      <IntegrationsPageView
        catalogURL={catalogURL}
        heading={provider?.name ?? "Интеграции"}
        isActionBusy={isCodexBusy}
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
        ) : providerID === "codex" ? (
          <CodexIntegrationPanel
            connection={state.catalog.connections.find(
              (item) => item.provider === "codex",
            )}
            isReloading={state.busyAction === "load"}
            onBusyChange={setCodexBusy}
            onConnectionChange={replaceCodex}
            vaultConfigured={state.catalog.vaultConfigured}
          />
        ) : (
          <IntegrationCatalog catalog={state.catalog} catalogURL={catalogURL} />
        )}
      </IntegrationsPageView>
    </AdminUiTheme>
  );
};
