/**
 * @file packages/payload-ai-plugin/src/admin/integrations/IntegrationsClient.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Определяет безопасные входные данные и состояние страниц интеграций.
 */

import type {
  IntegrationCatalogDTO,
  IntegrationProviderID,
} from "@realize/ai-contracts";
import type { ReactNode } from "react";
import type { useIntegrations } from "./useIntegrations.hook";

export type IntegrationsClientProps = {
  catalogURL: string;
  initialCatalog: IntegrationCatalogDTO;
  providerID?: IntegrationProviderID;
};

export type IntegrationsPageViewProps = {
  catalogURL: string;
  children: ReactNode;
  heading: string;
  isActionBusy?: boolean;
  isSettings: boolean;
  state: ReturnType<typeof useIntegrations>;
};
