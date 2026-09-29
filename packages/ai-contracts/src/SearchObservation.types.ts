/**
 * @file packages/ai-contracts/src/SearchObservation.types.ts
 * @version 1.0.0
 * @date 2026-09-27
 * @description Определяет публичную диагностику поиска и страницы истории Admin.
 */
import type { z } from "zod";
import type {
  searchObservationSchema,
  searchObservationQuerySchema,
} from "./searchObservation.schemas";

export type SearchObservation = z.infer<typeof searchObservationSchema>;
export type SearchObservationQuery = z.infer<
  typeof searchObservationQuerySchema
>;
export type SearchObservationPage = {
  items: {
    id: string;
    origin: "runtime" | "import";
    event: SearchObservation;
  }[];
  next: string | null;
  summary: {
    count: number;
    errors: number;
    partial: number;
    averageMs: number | null;
    p95Ms: number | null;
  };
  policy: {
    retentionDays: number;
    capacity: number;
    queueCapacity: number;
    slowMs: number;
  };
};
