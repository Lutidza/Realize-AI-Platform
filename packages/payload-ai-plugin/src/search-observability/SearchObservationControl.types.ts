/**
 * @file packages/payload-ai-plugin/src/search-observability/SearchObservationControl.types.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Задаёт внутренние типы управления диагностикой и порт heartbeat runtime.
 */
import type { z } from "zod";
import type { SearchObservationManagement } from "@realize/ai-contracts";
import type {
  searchObservationControlStateSchema,
  searchObservationRuntimeReportSchema,
} from "./searchObservationState.schemas";
import type { SearchObservationStore } from "./SearchObservationStore.repository";

export type SearchObservationControlState = z.infer<
  typeof searchObservationControlStateSchema
>;
export type SearchObservationRuntimeReport = z.infer<
  typeof searchObservationRuntimeReportSchema
>;
export type SearchObservationRuntimeSnapshot = Omit<
  SearchObservationRuntimeReport,
  "instanceID" | "source" | "startedAt"
>;
export type SearchObservationMaintenancePort = {
  maintain: (
    report?: SearchObservationRuntimeReport,
  ) => Promise<{ revision: number; cleaned: boolean }>;
};
export type SearchObservationCollectorStore = {
  append: SearchObservationStore["append"];
  control: SearchObservationMaintenancePort;
};
export type SearchObservationRuntimeMonitorOptions = {
  store: SearchObservationMaintenancePort;
  source: "cli" | "mcp";
  snapshot: () => SearchObservationRuntimeSnapshot;
  warn: () => void;
};
export type SearchObservationStorage = SearchObservationManagement["storage"];
