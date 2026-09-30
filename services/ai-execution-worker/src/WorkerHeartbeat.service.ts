/**
 * @file services/ai-execution-worker/src/WorkerHeartbeat.service.ts
 * @version 1.1.0
 * @date 2026-09-25
 * @description Поддерживает heartbeat независимо от долгого задания и запрещает claim после ошибки записи.
 */

import { randomUUID } from "node:crypto";
import type {
  WorkerAvailabilityDTO,
  WorkerJobKind,
} from "@realize/ai-contracts";
import {
  WORKER_HEARTBEAT_INTERVAL_MS,
  type WorkerCapabilities,
  type WorkerPresenceState,
} from "@realize/payload-ai-control/server/integration-runtime";
import type { WorkerHeartbeatWriter } from "./WorkerHeartbeat.types";

const NO_CAPABILITIES: WorkerCapabilities = {
  execution: false,
  preview: false,
  sourcePromotion: false,
  release: false,
};

/** Все записи сериализованы, поэтому запоздавший heartbeat не восстанавливает idle после остановки. */
export class WorkerHeartbeat {
  /** Тот же ключ сохраняется в job.workerID при claim; process label не является идентификатором сессии. */
  readonly instanceKey = randomUUID();
  private state: WorkerPresenceState = "idle";
  private capabilities = { ...NO_CAPABILITIES };
  private currentJob: WorkerAvailabilityDTO["currentJob"] = null;
  private healthy = false;
  private healthRevision = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private pending: Promise<boolean> = Promise.resolve(false);
  private closed = false;

  constructor(private readonly repository: WorkerHeartbeatWriter) {}

  /** До первого успешного heartbeat исполнитель не приступает к очередям. */
  async start(): Promise<void> {
    if (!(await this.sync()))
      throw new Error("Worker heartbeat storage is unavailable.");
    this.schedule();
  }

  get canClaim(): boolean {
    return this.healthy && !this.closed && this.state === "idle";
  }

  /** Idle error любого pool запрещает claim; только последующая успешная запись восстанавливает присутствие. */
  markUnhealthy(): void {
    this.healthy = false;
    this.healthRevision += 1;
  }

  setCapabilities(capabilities: WorkerCapabilities): void {
    this.capabilities = { ...capabilities };
  }

  async idle(): Promise<void> {
    this.currentJob = null;
    if (this.state !== "draining") this.state = "idle";
    await this.sync();
  }

  async busy(kind: WorkerJobKind, changeRequestID: string): Promise<void> {
    this.currentJob = { kind, changeRequestID };
    if (this.state !== "draining") this.state = "busy";
    await this.sync();
  }

  /** Design job не маскируется под Change Request и не раскрывается через прежний chat DTO. */
  async busyWorkshopPreview(): Promise<void> {
    this.currentJob = null;
    if (this.state !== "draining") this.state = "busy";
    await this.sync();
  }

  /** SIGTERM не отменяет уже claimed задачу; draining продолжает heartbeat без права брать следующую. */
  drain(): void {
    if (this.closed) return;
    this.state = "draining";
    void this.sync();
  }

  async finish(failed: boolean): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.state = failed ? "error" : "stopped";
    this.currentJob = null;
    await this.sync();
  }

  /** Не выбрасывает сообщения драйвера: ошибка не раскрывает адрес БД и не разрешает новый claim. */
  sync(): Promise<boolean> {
    this.pending = this.pending.then(async () => {
      const healthRevision = this.healthRevision;
      try {
        await this.repository.write({
          instanceKey: this.instanceKey,
          state: this.state,
          capabilities:
            this.state === "draining" || this.closed
              ? { ...NO_CAPABILITIES }
              : this.capabilities,
          currentJob: this.currentJob,
        });
        // Успех записи, начатой до idle error, не подтверждает восстановление после ошибки.
        if (this.healthRevision !== healthRevision) return false;
        this.healthy = true;
        return true;
      } catch {
        this.markUnhealthy();
        return false;
      }
    });
    return this.pending;
  }

  private schedule(): void {
    if (this.closed) return;
    this.timer = setTimeout(() => {
      void this.sync().then(() => this.schedule());
    }, WORKER_HEARTBEAT_INTERVAL_MS);
    this.timer.unref();
  }
}
