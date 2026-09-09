/**
 * @file packages/payload-ai-plugin/src/admin/integrations/catalog/integrationCatalog.constants.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет варианты фильтра активности каталога.
 */

import type { IntegrationActivityFilter } from "./IntegrationCatalog.types";

export const INTEGRATION_ACTIVITY_FILTERS = [
  { value: "all", label: "Все" },
  { value: "active", label: "Активные" },
  { value: "inactive", label: "Неактивные" },
] satisfies ReadonlyArray<{ value: IntegrationActivityFilter; label: string }>;
