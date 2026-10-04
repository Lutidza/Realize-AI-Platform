/**
 * @file services/ai-control-plane/src/LocalSearchObservationCollector.service.ts
 * @version 1.2.0
 * @date 2026-09-30
 * @description Автоматически доставляет проверенные локальные замеры CLI в общее хранилище.
 * @see documentation/architecture/repository-search.md
 */
import {
  searchObservationSchema,
  type SearchObservation,
} from "@realize/ai-contracts";
import {
  SearchObservationRuntimeMonitor,
  type SearchObservationCollectorStore,
  type SearchObservationRuntimeSnapshot,
} from "@realize/payload-ai-control/server/search-observability";
import {
  acknowledgeSearchObservations,
  readSearchObservationSpool,
  SEARCH_SPOOL_POLICY,
  enqueueSearchObservation,
} from "../../../.ai/tools/agent-search/src/searchObservationSpool.adapter.mjs";

/** Один consumer на процесс; durable dedupe делает безопасным повтор после crash или рестарта. */
export class LocalSearchObservationCollector {
  private readonly timer: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private closed = false;
  private failures = 0;
  private nextAttempt = 0;
  private lastWarning = 0;
  private observedDrops = 0;
  private rejectedDrops = 0;
  private queued = 0;
  private lastDeliveredAt: string | null = null;
  private lastFailureAt: string | null = null;
  private errorCode: SearchObservationRuntimeSnapshot["errorCode"] = null;
  private readonly monitor: SearchObservationRuntimeMonitor;

  constructor(
    private readonly root: string,
    private readonly store: SearchObservationCollectorStore,
    private readonly warn: (event: { code: string; dropped?: number }) => void,
    private readonly binding?: {
      consumer: "execution" | "review";
      runID: string;
      handoffRoot?: string;
    },
  ) {
    this.timer = setInterval(() => {
      void this.flush();
    }, 1000);
    this.timer.unref();
    this.monitor = new SearchObservationRuntimeMonitor({
      store: this.store.control,
      source: "cli",
      snapshot: () => this.snapshot(),
      warn: () =>
        this.warning({ code: "SEARCH_TELEMETRY_MAINTENANCE_UNAVAILABLE" }),
    });
  }

  snapshot(): SearchObservationRuntimeSnapshot {
    return {
      queued: this.queued,
      dropped: this.observedDrops + this.rejectedDrops,
      lastDeliveredAt: this.lastDeliveredAt,
      lastFailureAt: this.lastFailureAt,
      errorCode: this.errorCode,
    };
  }

  flush(force = false): Promise<void> {
    if (this.active) return this.active;
    if (!force && (this.closed || Date.now() < this.nextAttempt))
      return Promise.resolve();
    this.active = this.drain()
      .catch(() => {
        this.lastFailureAt = new Date().toISOString();
        this.errorCode ??= "delivery_unavailable";
        this.failures++;
        this.nextAttempt =
          Date.now() + Math.min(30000, 1000 * 2 ** Math.min(this.failures, 5));
        if (Date.now() - this.lastWarning >= 60000) {
          this.lastWarning = Date.now();
          this.warning({ code: "SEARCH_TELEMETRY_DELIVERY_UNAVAILABLE" });
        }
      })
      .finally(() => {
        this.active = undefined;
      });
    return this.active;
  }

  private warning(event: { code: string; dropped?: number }) {
    try {
      this.warn(event);
    } catch {
      /* Ошибка logger не влияет на поиск. */
    }
  }

  private async drain() {
    let batch: ReturnType<typeof readSearchObservationSpool>;
    try {
      batch = readSearchObservationSpool(this.root);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        this.queued = 0;
        this.failures = 0;
        this.nextAttempt = 0;
        this.errorCode = null;
        return;
      }
      this.errorCode = "buffer_unavailable";
      throw error;
    }
    this.queued = batch.rows.length;
    this.errorCode = null;
    if (batch.dropped > this.observedDrops) {
      this.warning({
        code: "SEARCH_TELEMETRY_DROPPED",
        dropped: batch.dropped - this.observedDrops,
      });
      this.observedDrops = batch.dropped;
    }
    const events: SearchObservation[] = [];
    const rejected: string[] = [];
    for (const row of batch.rows) {
      try {
        if (
          typeof row.payload !== "string" ||
          typeof row.eventID !== "string" ||
          Buffer.byteLength(row.payload) > SEARCH_SPOOL_POLICY.eventBytes
        )
          throw new Error();
        const event = searchObservationSchema.parse(JSON.parse(row.payload));
        if (
          event.source !== "cli" ||
          event.eventID !== row.eventID ||
          Date.parse(event.observedAt) > Date.now() + 300000 ||
          Date.parse(event.observedAt) <
            Date.now() - SEARCH_SPOOL_POLICY.retentionMs
        )
          throw new Error();
        events.push(this.bind(event));
      } catch {
        if (typeof row.eventID === "string") rejected.push(row.eventID);
      }
    }
    if (rejected.length) {
      acknowledgeSearchObservations(this.root, rejected);
      this.rejectedDrops += rejected.length;
      this.queued -= rejected.length;
      this.warning({
        code: "SEARCH_TELEMETRY_DROPPED",
        dropped: rejected.length,
      });
    }
    if (events.length) {
      await this.store.append(events, "import");
      acknowledgeSearchObservations(
        this.root,
        events.map((event) => event.eventID),
      );
      this.queued -= events.length;
      this.lastDeliveredAt = new Date().toISOString();
    }
    this.failures = 0;
    this.nextAttempt = 0;
  }

  async close() {
    this.closed = true;
    clearInterval(this.timer);
    await this.active;
    await this.flush(true);
    // Метрики worktree переживают cleanup: transfer → ack только после durable enqueue владельцу установки.
    if (this.queued && this.binding?.handoffRoot) {
      try {
        const transferred: string[] = [];
        for (const row of readSearchObservationSpool(this.root).rows) {
          if (
            typeof row.payload !== "string" ||
            typeof row.eventID !== "string" ||
            Buffer.byteLength(row.payload) > SEARCH_SPOOL_POLICY.eventBytes
          )
            continue;
          const event = searchObservationSchema.parse(JSON.parse(row.payload));
          if (
            event.source === "cli" &&
            event.eventID === row.eventID &&
            Date.parse(event.observedAt) <= Date.now() + 300000 &&
            Date.parse(event.observedAt) >=
              Date.now() - SEARCH_SPOOL_POLICY.retentionMs &&
            enqueueSearchObservation(this.binding.handoffRoot, this.bind(event))
          )
            transferred.push(row.eventID);
        }
        acknowledgeSearchObservations(this.root, transferred);
        this.queued -= transferred.length;
      } catch {
        this.errorCode = "buffer_unavailable";
      }
    }
    await this.monitor.close();
  }
  private bind(event: SearchObservation): SearchObservation {
    return this.binding
      ? { ...event, consumer: this.binding.consumer, runID: this.binding.runID }
      : event;
  }
}
