/**
 * @file packages/payload-ai-plugin/src/search-observability/SearchObservationCollector.service.ts
 * @version 1.1.0
 * @date 2026-09-28
 * @description Изолирует поиск от ошибок БД ограниченной очередью без повторного сканирования.
 * @see documentation/architecture/repository-search.md
 */
import {
  searchObservationSchema,
  type SearchObservation,
} from "@realize/ai-contracts";
import { SEARCH_OBSERVATION_POLICY } from "./searchObservation.config";
import { SearchObservationRuntimeMonitor } from "./SearchObservationRuntimeMonitor.service";
import type {
  SearchObservationRuntimeSnapshot,
  SearchObservationCollectorStore,
} from "./SearchObservationControl.types";
import { EndpointError } from "../endpoints/http";

export class SearchObservationCollector {
  private readonly pending: SearchObservation[] = [];
  private readonly timer: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private inflight = 0;
  private closed = false;
  private dropped = 0;
  private unreportedDrops = 0;
  private lastWarning = 0;
  private failures = 0;
  private nextAttempt = 0;
  private lastDeliveredAt: string | null = null;
  private lastFailureAt: string | null = null;
  private errorCode: SearchObservationRuntimeSnapshot["errorCode"] = null;
  private readonly monitor: SearchObservationRuntimeMonitor;

  constructor(
    private readonly store: SearchObservationCollectorStore,
    private readonly warn: (event: { code: string; dropped: number }) => void,
  ) {
    this.timer = setInterval(() => {
      void this.flush();
    }, 1000);
    this.timer.unref();
    this.monitor = new SearchObservationRuntimeMonitor({
      store: this.store.control,
      source: "mcp",
      snapshot: () => this.snapshot(),
      warn: () => this.warning("SEARCH_TELEMETRY_MAINTENANCE_UNAVAILABLE", 0),
    });
  }

  snapshot(): SearchObservationRuntimeSnapshot {
    return {
      queued: this.pending.length + this.inflight,
      dropped: this.dropped,
      lastDeliveredAt: this.lastDeliveredAt,
      lastFailureAt: this.lastFailureAt,
      errorCode: this.errorCode,
    };
  }

  private warning(code: string, dropped: number) {
    if (Date.now() - this.lastWarning < 60000) return;
    this.lastWarning = Date.now();
    try {
      this.warn({ code, dropped });
    } catch {
      /* Logger не блокирует поиск. */
    }
  }

  /** Контракт синхронный: никакого ожидания БД на пути ответа инструмента. */
  record = (input: SearchObservation): void => {
    if (this.closed) return;
    const parsed = searchObservationSchema.safeParse(input);
    if (
      !parsed.success ||
      this.pending.length + this.inflight >=
        SEARCH_OBSERVATION_POLICY.queueCapacity
    ) {
      this.dropped++;
      this.unreportedDrops++;
      return;
    }
    this.pending.push(parsed.data);
  };

  flush(force = false): Promise<void> {
    if (this.active) return this.active;
    if (this.unreportedDrops && Date.now() - this.lastWarning >= 60000) {
      this.warning("SEARCH_TELEMETRY_DROPPED", this.unreportedDrops);
      this.unreportedDrops = 0;
    }
    if (
      !this.pending.length ||
      (!force && (this.closed || Date.now() < this.nextAttempt))
    )
      return Promise.resolve();
    const batch = this.pending.splice(0);
    this.inflight = batch.length;
    this.active = this.store
      .append(batch, "runtime")
      .then(() => {
        this.failures = 0;
        this.nextAttempt = 0;
        this.errorCode = null;
        this.lastDeliveredAt = new Date().toISOString();
      })
      .catch((error: unknown) => {
        this.lastFailureAt = new Date().toISOString();
        this.errorCode = "delivery_unavailable";
        // Временный отказ не теряет batch. Детерминированно неверный payload не зацикливается.
        if (
          error instanceof EndpointError &&
          ["INVALID_REQUEST", "CONFLICT"].includes(error.code)
        ) {
          this.dropped += batch.length;
          this.unreportedDrops += batch.length;
        } else {
          this.inflight = 0;
          this.pending.unshift(...batch);
          this.failures++;
          this.nextAttempt =
            Date.now() +
            Math.min(30000, 1000 * 2 ** Math.min(this.failures, 5));
          this.warning("SEARCH_TELEMETRY_DELIVERY_UNAVAILABLE", 0);
        }
      })
      .finally(() => {
        this.active = undefined;
        this.inflight = 0;
      });
    return this.active;
  }

  async close() {
    this.closed = true;
    clearInterval(this.timer);
    await this.active;
    await this.flush(true);
    // MCP очередь process-local; штатное завершение явно учитывает недоставленный остаток.
    if (this.pending.length) {
      this.dropped += this.pending.length;
      this.unreportedDrops += this.pending.length;
      this.pending.length = 0;
    }
    await this.monitor.tick();
    await this.monitor.close();
  }
}
