/**
 * @file packages/payload-ai-plugin/src/admin/integrations/IntegrationsView.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт серверный маршрут и безопасные данные представления интеграций.
 */

import type {
  IntegrationCatalogDTO,
  IntegrationProviderID,
} from "@realize/ai-contracts";
import type { AdminViewServerProps } from "payload";

/** Настройки custom view передаются Payload через Component.serverProps. */
export type IntegrationsViewProps = AdminViewServerProps & {
  integrationsRoute: `/${string}`;
  mode: "catalog" | "settings";
};

/** Отсутствующий providerID открывает каталог, заданный — настройки провайдера. */
export type IntegrationsViewData = {
  catalogURL: string;
  initialCatalog: IntegrationCatalogDTO;
  providerID?: IntegrationProviderID;
};
