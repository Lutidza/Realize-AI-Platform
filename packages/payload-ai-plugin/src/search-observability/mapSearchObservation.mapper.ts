/**
 * @file packages/payload-ai-plugin/src/search-observability/mapSearchObservation.mapper.ts
 * @version 1.0.0
 * @date 2026-09-27
 * @description Выдаёт только проверенный DTO, исключая внутренние поля хранилища.
 */
import {
  searchObservationSchema,
  type SearchObservationPage,
} from "@realize/ai-contracts";
import type { SearchObservationRow } from "./SearchObservationStore.types";
export function mapSearchObservation(
  row: SearchObservationRow,
): SearchObservationPage["items"][number] {
  if (row.origin !== "runtime" && row.origin !== "import")
    throw new Error("SEARCH_OBSERVATION_ORIGIN_INVALID");
  return {
    id: String(row.id),
    origin: row.origin,
    event: searchObservationSchema.parse(row.event),
  };
}
