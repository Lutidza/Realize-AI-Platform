/**
 * @file packages/payload-ai-plugin/src/search-observability/SearchQualityStore.repository.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Сохраняет bounded контрольные summaries в существующем JSONB state, отдельно от сырых tool events.
 * @see documentation/architecture/repository-search.md
 */
import {
  searchQualityImportSchema,
  type SearchQualityRun,
} from "@realize/ai-contracts";
import { EndpointError } from "../endpoints/http";
import { SearchObservationControl } from "./SearchObservationControl.repository";
import { withSearchObservationTransaction } from "./withSearchObservationTransaction.adapter";
import type { SearchObservationDatabase } from "./SearchObservationStore.types";
export class SearchQualityStore {
  constructor(private readonly database: SearchObservationDatabase) {}
  append(input: { runs: SearchQualityRun[] }) {
    const parsed = searchQualityImportSchema.parse(input);
    const now = Date.now();
    if (
      parsed.runs.some(
        (run) =>
          Date.parse(run.observedAt) < now - 180 * 86400000 ||
          Date.parse(run.observedAt) > now + 300000,
      ) ||
      new Set(parsed.runs.map((run) => run.id)).size !== parsed.runs.length
    )
      throw new EndpointError(
        "INVALID_REQUEST",
        "Контрольные замеры требуют уникальных IDs и допустимых дат.",
        400,
      );
    return withSearchObservationTransaction(this.database, async (client) => {
      const control = new SearchObservationControl(this.database);
      const state = await control.load(client);
      const cutoff = Math.max(
        now - 180 * 86400000,
        state.qualityClearedBefore ? Date.parse(state.qualityClearedBefore) : 0,
      );
      let inserted = 0;
      for (const run of parsed.runs) {
        if (Date.parse(run.observedAt) < cutoff) continue;
        const previous = state.qualityRuns.find((item) => item.id === run.id);
        if (previous && JSON.stringify(previous) !== JSON.stringify(run))
          throw new EndpointError(
            "CONFLICT",
            "Этот run ID уже связан с другим контрольным замером.",
            409,
          );
        if (!previous) {
          state.qualityRuns.push(run);
          inserted++;
        }
      }
      state.qualityRuns = state.qualityRuns
        .filter((run) => Date.parse(run.observedAt) >= now - 180 * 86400000)
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
        .slice(0, 64);
      await control.persist(client, state);
      return { inserted, retained: state.qualityRuns.length };
    });
  }
}
