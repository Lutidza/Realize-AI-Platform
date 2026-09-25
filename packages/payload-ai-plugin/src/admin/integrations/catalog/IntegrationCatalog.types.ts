/**
 * @file packages/payload-ai-plugin/src/admin/integrations/catalog/IntegrationCatalog.types.ts
 * @version 1.0.1
 * @date 2026-09-23
 * @description Задаёт контракты поиска, фильтров и карточек каталога интеграций.
 */

import type {
  IntegrationCatalogDTO,
  IntegrationProviderDescriptorDTO,
} from "@realize/ai-contracts";
import type { ComponentType, SVGProps } from "react";
import type { useIntegrationCatalog } from "./useIntegrationCatalog.hook";

export type IntegrationActivityFilter = "all" | "active" | "inactive";
export type IntegrationCatalogProps = {
  catalog: IntegrationCatalogDTO;
  catalogURL: string;
};
export type IntegrationCardItem = {
  provider: IntegrationProviderDescriptorDTO;
  isActive: boolean;
};
export type IntegrationCardProps = IntegrationCardItem & { href: string };
export type IntegrationCatalogViewProps = {
  catalogURL: string;
  catalogSize: number;
  filters: ReturnType<typeof useIntegrationCatalog>;
};
export type IntegrationPresentationRegistry = Record<
  IntegrationProviderDescriptorDTO["id"],
  { Logo: ComponentType<SVGProps<SVGSVGElement>> }
>;
