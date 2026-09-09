/**
 * @file packages/payload-ai-plugin/src/admin/integrations/catalog/IntegrationCatalog.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Связывает локальные фильтры с представлением каталога.
 */

"use client";

import type { IntegrationCatalogProps } from "./IntegrationCatalog.types";
import { IntegrationCatalogView } from "./IntegrationCatalog.view";
import { useIntegrationCatalog } from "./useIntegrationCatalog.hook";

export const IntegrationCatalog = ({
  catalog,
  catalogURL,
}: IntegrationCatalogProps) => {
  const filters = useIntegrationCatalog(catalog);
  return (
    <IntegrationCatalogView
      catalogSize={catalog.providers.length}
      catalogURL={catalogURL}
      filters={filters}
    />
  );
};
