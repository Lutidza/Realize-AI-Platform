/**
 * @file tests/int/WorkerPresence.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет потерю исполнителя, несколько процессов, границы заданий и lifecycle heartbeat.
 */

// @vitest-environment node

import { EventEmitter } from "node:events";
import type { Pool } from "pg";
import { watchWorkerPoolErrors } from "../../services/ai-execution-worker/src/watchWorkerPoolErrors.service";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerPresenceCollection } from "../../packages/payload-ai-plugin/src/collections/workerPresence.collection";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";
import { WorkerHeartbeat } from "../../services/ai-execution-worker/src/WorkerHeartbeat.service";
import { mapWorkerAvailability } from "../../packages/payload-ai-plugin/src/integrations/runtime/mapWorkerAvailability.mapper";
import type {
  WorkerPresenceRow,
  WorkerPresenceUpdate,
} from "../../packages/payload-ai-plugin/src/integrations/runtime/WorkerPresence.types";
import { WorkerPresenceRepository } from "../../packages/payload-ai-plugin/src/integrations/runtime/WorkerPresence.repository";
import type { IntegrationRegistryDatabase } from "../../packages/payload-ai-plugin/src/integrations/runtime/IntegrationRuntime.types";

const capabilities = {
  execution: true,
  preview: true,
  sourcePromotion: false,
  release: false,
};
const row = (
  overrides: Partial<WorkerPresenceRow> = {},
): WorkerPresenceRow => ({
  instance_key: "worker-1",
  state: "idle",
  last_seen_at: "2026-09-11T10:00:00Z",
  fresh: true,
  capabilities,
  current_kind: null,
  current_change_request: null,
  ...overrides,
});
const snapshot = (...rows: WorkerPresenceRow[]) => ({ rows, readable: true });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Доступность исполнителей", () => {
  it("закрывает прямой CRUD heartbeat для любых пользователей Payload", async () => {
    const collection = createWorkerPresenceCollection(
      sanitizeOptions({
        runtime: {
          mode: "local-development",
          controlPlaneTokenEnv: "TEST_CONTROL_PLANE_TOKEN",
        },
        access: {
          canUseChat: () => true,
          canViewRuns: () => true,
          canApproveRelease: () => true,
          canManageAIConfiguration: () => true,
          canManageData: () => true,
          canManageIntegrations: () => true,
        },
      }),
    );
    expect(collection.admin?.hidden).toBe(true);
    expect(collection.lockDocuments).toBe(false);
    for (const action of ["create", "read", "update", "delete"] as const) {
      expect(
        await collection.access?.[action]?.({
          req: { user: { id: 1, roles: ["admin"] } },
        } as never),
      ).toBe(false);
    }
  });

  it("различает отсутствие процесса, stale, контролируемую остановку, ошибку и недоступность хранилища", () => {
    expect(mapWorkerAvailability(snapshot()).reason).toContain(
      "ещё не подключался",
    );
    expect(
      mapWorkerAvailability(snapshot(row({ fresh: false }))).reason,
    ).toContain("Связь");
    expect(
      mapWorkerAvailability(snapshot(row({ state: "stopped" }))).reason,
    ).toContain("остановлен");
    expect(
      mapWorkerAvailability(snapshot(row({ state: "error" }))).reason,
    ).toContain("ошибки");
    expect(
      mapWorkerAvailability({ rows: [row()], readable: false }).state,
    ).toBe("unavailable");
  });

  it("учитывает подходящие живые процессы и не принимает stale worker за свободный", () => {
    const busy = row({
      state: "busy",
      current_kind: "execution",
      current_change_request: "42",
    });
    const available = mapWorkerAvailability(
      snapshot(busy, row({ instance_key: "worker-2" })),
      { operation: "execution" },
    );
    expect(available).toMatchObject({
      state: "available",
      activeCount: 2,
      busyCount: 1,
      currentJob: { changeRequestID: "42" },
    });
    expect(
      mapWorkerAvailability(snapshot(busy, row({ fresh: false }))).state,
    ).toBe("busy");
    expect(
      mapWorkerAvailability(snapshot(busy, row()), { operation: "release" })
        .state,
    ).toBe("unavailable");
  });

  it("скрывает чужую текущую задачу в чате и сохраняет собственную", () => {
    const busy = row({
      state: "busy",
      current_kind: "execution",
      current_change_request: "42",
    });
    expect(
      mapWorkerAvailability(snapshot(busy), { allowedChangeRequestID: "41" })
        .currentJob,
    ).toBeNull();
    expect(
      mapWorkerAvailability(snapshot(busy), { allowedChangeRequestID: "42" })
        .currentJob?.changeRequestID,
    ).toBe("42");
    expect(JSON.stringify(mapWorkerAvailability(snapshot(busy)))).not.toContain(
      "worker-1",
    );
  });

  it("не выдаёт другой здоровый процесс за исполнителя зависшего claimed задания", () => {
    const assigned = row({
      state: "busy",
      fresh: false,
      current_kind: "execution",
      current_change_request: "42",
    });
    const result = mapWorkerAvailability(
      snapshot(row({ instance_key: "worker-2" }), assigned),
      { assignedInstanceKey: "worker-1", allowedChangeRequestID: "42" },
    );
    expect(result).toMatchObject({
      state: "unavailable",
      activeCount: 0,
      currentJob: null,
    });
    expect(result.reason).toContain("Автоматический повтор не выполняется");
  });

  it("сохраняет busy подтверждённого задания после отключения будущих claims", () => {
    const result = mapWorkerAvailability(
      snapshot(
        row({
          state: "busy",
          current_kind: "execution",
          current_change_request: "42",
          capabilities: {},
        }),
      ),
      {
        assignedInstanceKey: "worker-1",
        allowedChangeRequestID: "42",
        operation: "execution",
        disabledReason: "Следующие задания выключены",
      },
    );
    expect(result.state).toBe("busy");
    expect(result.reason).toContain("подтверждает выполнение");
  });

  it("показывает draining текущего задания без готовности принимать следующее", () => {
    const result = mapWorkerAvailability(
      snapshot(
        row({
          state: "draining",
          current_kind: "execution",
          current_change_request: "42",
          capabilities: {},
        }),
      ),
    );
    expect(result.state).toBe("busy");
    expect(result.reason).toContain("останавливается");
    expect(
      mapWorkerAvailability(snapshot(row({ state: "draining" }))).busyCount,
    ).toBe(0);
  });

  it("не разрешает новые этапы через draining процесс, сохраняя busy его assigned задания", () => {
    const presence = snapshot(
      row({
        state: "draining",
        current_kind: "execution",
        current_change_request: "42",
        capabilities: {},
      }),
    );
    expect(mapWorkerAvailability(presence).state).toBe("busy");
    expect(
      mapWorkerAvailability(presence, {
        assignedInstanceKey: "worker-1",
        operation: "execution",
        allowedChangeRequestID: "42",
      }).state,
    ).toBe("busy");
    for (const operation of [
      "execution",
      "preview",
      "sourcePromotion",
      "release",
    ] as const)
      expect(mapWorkerAvailability(presence, { operation }).state).toBe(
        "unavailable",
      );
  });

  it("явно сообщает запрет админки даже при живом idle исполнителе", () => {
    expect(
      mapWorkerAvailability(snapshot(row()), {
        disabledReason: "Агент выключен",
      }),
    ).toMatchObject({
      state: "unavailable",
      activeCount: 1,
      reason: "Агент выключен",
    });
  });
});

describe("Heartbeat независимо от работы очереди", () => {
  it("продолжает сигнал во время долгого задания и закрывает процесс с terminal state", async () => {
    vi.useFakeTimers();
    const write = vi.fn(async (_update: WorkerPresenceUpdate) => {});
    const heartbeat = new WorkerHeartbeat({ write });
    await heartbeat.start();
    heartbeat.setCapabilities(capabilities);
    await heartbeat.busy("execution", "42");
    const before = write.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(write.mock.calls.length).toBeGreaterThan(before + 1);
    expect(write.mock.lastCall?.[0]).toMatchObject({
      state: "busy",
      currentJob: { kind: "execution", changeRequestID: "42" },
    });
    await heartbeat.finish(false);
    expect(write.mock.lastCall?.[0]).toMatchObject({
      state: "stopped",
      currentJob: null,
    });
    expect(heartbeat.canClaim).toBe(false);
    const closed = write.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(write).toHaveBeenCalledTimes(closed);
  });

  it("запрещает claim после потери heartbeat до успешной записи и восстановления idle", async () => {
    vi.useFakeTimers();
    const write = vi.fn(async (_update: WorkerPresenceUpdate) => {});
    const heartbeat = new WorkerHeartbeat({ write });
    await heartbeat.start();
    expect(heartbeat.canClaim).toBe(true);
    write.mockRejectedValueOnce(new Error("secret connection string"));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(heartbeat.canClaim).toBe(false);
    await heartbeat.sync();
    expect(heartbeat.canClaim).toBe(true);
    await heartbeat.finish(true);
    expect(write.mock.lastCall?.[0].state).toBe("error");
  });

  it("при SIGTERM оставляет задание busy/draining и закрывает все capabilities", async () => {
    vi.useFakeTimers();
    const write = vi.fn(async (_update: WorkerPresenceUpdate) => {});
    const heartbeat = new WorkerHeartbeat({ write });
    await heartbeat.start();
    heartbeat.setCapabilities(capabilities);
    await heartbeat.busy("preview", "42");
    heartbeat.drain();
    await heartbeat.sync();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(heartbeat.canClaim).toBe(false);
    expect(write.mock.lastCall?.[0]).toMatchObject({
      state: "draining",
      currentJob: { kind: "preview", changeRequestID: "42" },
      capabilities: { execution: false, preview: false },
    });
    await heartbeat.finish(false);
    expect(write.mock.lastCall?.[0].state).toBe("stopped");
  });

  it("не создаёт overlapping writes и не восстанавливает idle поздним heartbeat после остановки", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const write = vi.fn(async (_update: WorkerPresenceUpdate) => {});
    const heartbeat = new WorkerHeartbeat({ write });
    await heartbeat.start();
    write.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const syncing = heartbeat.sync();
    await Promise.resolve();
    const finishing = heartbeat.finish(false);
    expect(write).toHaveBeenCalledTimes(2);
    release!();
    await Promise.all([syncing, finishing]);
    expect(write.mock.lastCall?.[0].state).toBe("stopped");
    expect(heartbeat.canClaim).toBe(false);
  });

  it("обрабатывает idle error обоих pools без crash и запрещает claims до следующего успешного heartbeat", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const pools = [new EventEmitter(), new EventEmitter()];
    const write = vi.fn(async (_update: WorkerPresenceUpdate) => {});
    const heartbeat = new WorkerHeartbeat({ write });
    watchWorkerPoolErrors(pools as unknown as Pick<Pool, "on">[], () =>
      heartbeat.markUnhealthy(),
    );
    await heartbeat.start();
    for (const pool of pools) {
      expect(heartbeat.canClaim).toBe(true);
      expect(() =>
        pool.emit("error", new Error("secret connection string")),
      ).not.toThrow();
      expect(heartbeat.canClaim).toBe(false);
      await heartbeat.sync();
    }
    await heartbeat.busy("execution", "42");
    pools[0].emit("error", new Error("secret connection string"));
    await heartbeat.sync();
    expect(write.mock.lastCall?.[0]).toMatchObject({
      state: "busy",
      currentJob: { changeRequestID: "42" },
    });
    expect(heartbeat.canClaim).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "secret connection string",
    );
    heartbeat.drain();
    pools[1].emit("error", new Error("secret connection string"));
    await heartbeat.sync();
    expect(write.mock.lastCall?.[0].state).toBe("draining");
    await heartbeat.finish(false);
  });

  it("не принимает успешную запись, начатую до pool error, за восстановление после ошибки", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const write = vi.fn(async (_update: WorkerPresenceUpdate) => {});
    const heartbeat = new WorkerHeartbeat({ write });
    await heartbeat.start();
    write.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const pending = heartbeat.sync();
    await Promise.resolve();
    heartbeat.markUnhealthy();
    release!();
    expect(await pending).toBe(false);
    expect(heartbeat.canClaim).toBe(false);
    await heartbeat.sync();
    expect(heartbeat.canClaim).toBe(true);
    await heartbeat.finish(false);
  });

  it("не стартует без первого heartbeat и не раскрывает ошибку драйвера", async () => {
    const heartbeat = new WorkerHeartbeat({
      write: async () => {
        throw new Error("secret");
      },
    });
    await expect(heartbeat.start()).rejects.toThrow(
      "Worker heartbeat storage is unavailable.",
    );
    expect(heartbeat.canClaim).toBe(false);
  });
});

describe("SQL heartbeat", () => {
  it("использует clock_timestamp для записи и stale, сохраняя отдельную выборку assigned instance", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({
      rows: [],
    }));
    const repository = new WorkerPresenceRepository({
      query,
    } as unknown as IntegrationRegistryDatabase);
    await repository.write({
      instanceKey: "instance",
      state: "idle",
      capabilities,
      currentJob: null,
    });
    expect(query.mock.calls[0]?.[0]).toContain("clock_timestamp()");
    await repository.read("assigned");
    expect(query.mock.lastCall?.[0]).toContain("clock_timestamp() - $1");
    expect(query.mock.lastCall?.[1]).toEqual([20_000, "assigned"]);
    query.mockRejectedValueOnce(new Error("secret address"));
    expect(await repository.read()).toEqual({ rows: [], readable: false });
  });
});
