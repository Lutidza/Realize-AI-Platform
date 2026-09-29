/**
 * @file packages/payload-ai-plugin/src/search-observability/SearchObservationStore.types.ts
 * @version 1.0.0
 * @date 2026-09-27
 * @description Задаёт закрытую строку PostgreSQL и порт существующего пула Payload.
 */
import type { Pool } from "pg";
export type SearchObservationDatabase = { pool?: Pick<Pool, "connect"> };
export type SearchObservationRow = {
  id: number;
  origin: unknown;
  event: unknown;
};
