/**
 * @file packages/payload-ai-plugin/src/search-observability/SearchObservationRuntimeMonitor.service.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Обслуживает диагностику и сообщает heartbeat независимо от наличия поисковых событий.
 */
import { randomUUID } from "node:crypto";
import { SEARCH_OBSERVATION_MANAGEMENT_LIMITS as limits } from "@realize/ai-contracts";
import type { SearchObservationRuntimeMonitorOptions } from "./SearchObservationControl.types";

export class SearchObservationRuntimeMonitor {
  private readonly instanceID = randomUUID();
  private readonly startedAt = new Date().toISOString();
  private readonly timer: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private closed = false;
  private lastWarning = 0;

  constructor(
    private readonly options: SearchObservationRuntimeMonitorOptions,
  ) {
    this.timer = setInterval(() => {
      void this.tick();
    }, limits.heartbeatMs);
    this.timer.unref();
    // Обслуживание после простоя начинается при запуске, даже если новых поисков нет.
    void this.tick();
  }

  tick(): Promise<void> {
    if (this.active) return this.active;
    if (this.closed) return Promise.resolve();
    this.active = Promise.resolve()
      .then(async () => {
        await this.options.store.maintain({
          ...this.options.snapshot(),
          instanceID: this.instanceID,
          source: this.options.source,
          startedAt: this.startedAt,
        });
      })
      .catch(() => {
        if (Date.now() - this.lastWarning >= 60000) {
          this.lastWarning = Date.now();
          try {
            this.options.warn();
          } catch {
            /* Отказ logger не влияет на поиск. */
          }
        }
      })
      .finally(() => {
        this.active = undefined;
      });
    return this.active;
  }

  async close() {
    this.closed = true;
    clearInterval(this.timer);
    await this.active;
  }
}
