/**
 * @file packages/payload-ai-plugin/src/admin/integrations/catalog/selectIntegrationCards.util.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отбирает карточки по поиску и активности сохранённых подключений.
 */

import type { IntegrationCatalogDTO } from "@realize/ai-contracts";
import type {
  IntegrationActivityFilter,
  IntegrationCardItem,
} from "./IntegrationCatalog.types";

/** Активность определяется enabled, независимо от токена и результата проверки. */
export const selectIntegrationCards = (
  catalog: IntegrationCatalogDTO,
  query: string,
  activity: IntegrationActivityFilter,
): IntegrationCardItem[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const activeProviders = new Set(
    catalog.connections
      .filter((connection) => connection.enabled)
      .map((connection) => connection.provider),
  );
  return catalog.providers.flatMap((provider) => {
    const isActive = activeProviders.has(provider.id);
    const matchesActivity =
      activity === "all" || (activity === "active" ? isActive : !isActive);
    const matchesSearch = `${provider.name} ${provider.description}`
      .toLocaleLowerCase("ru-RU")
      .includes(normalizedQuery);
    return matchesActivity && matchesSearch ? [{ provider, isActive }] : [];
  });
};
