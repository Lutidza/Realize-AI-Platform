/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchObservations.types.ts
 * @version 1.0.0
 * @date 2026-09-27
 * @description Описывает серверную страницу и props диагностики поиска.
 */
import type { AdminViewServerProps } from "payload";
import type { SearchObservationPage } from "@realize/ai-contracts";
export type SearchObservationsViewProps = AdminViewServerProps;
export type SearchObservationsClientProps = { apiURL: string };
export type SearchObservationDetailsProps = {
  item: SearchObservationPage["items"][number];
};
