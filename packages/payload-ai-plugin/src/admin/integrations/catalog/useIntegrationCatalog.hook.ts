/**
 * @file packages/payload-ai-plugin/src/admin/integrations/catalog/useIntegrationCatalog.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Управляет поиском и фильтром каталога без дополнительных запросов.
 */

"use client";

import type { IntegrationCatalogDTO } from "@realize/ai-contracts";
import { useState } from "react";
import type { IntegrationActivityFilter } from "./IntegrationCatalog.types";
import { selectIntegrationCards } from "./selectIntegrationCards.util";

export const useIntegrationCatalog = (catalog: IntegrationCatalogDTO) => {
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState<IntegrationActivityFilter>("all");
  const cards = selectIntegrationCards(catalog, query, activity);
  const reset = () => {
    setQuery("");
    setActivity("all");
  };
  return { activity, cards, query, reset, setActivity, setQuery };
};
