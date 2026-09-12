/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/mapWorkerAvailability.mapper.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Преобразует heartbeat в доступность общего исполнителя или выбранного этапа без утечки чужих задач.
 */

import type { WorkerAvailabilityDTO } from "@realize/ai-contracts";
import type {
  WorkerAvailabilityOptions,
  WorkerPresenceRow,
  WorkerPresenceSnapshot,
} from "./WorkerPresence.types";

const currentJob = (
  row: WorkerPresenceRow,
): WorkerAvailabilityDTO["currentJob"] =>
  ["execution", "preview", "sourcePromotion", "release"].includes(
    row.current_kind ?? "",
  ) &&
  typeof row.current_change_request === "string" &&
  /^[1-9]\d*$/.test(row.current_change_request)
    ? { kind: row.current_kind!, changeRequestID: row.current_change_request }
    : null;

/** allowedChangeRequestID ограничивает сведения о задании; admin diagnostics передаёт undefined. */
export const mapWorkerAvailability = (
  snapshot: WorkerPresenceSnapshot,
  options: WorkerAvailabilityOptions = {},
): WorkerAvailabilityDTO => {
  const rows = options.assignedInstanceKey
    ? snapshot.rows.filter(
        (row) => row.instance_key === options.assignedInstanceKey,
      )
    : snapshot.rows;
  const live = rows.filter(
    (row) => row.fresh && ["idle", "busy", "draining"].includes(row.state),
  );
  const latest = rows[0];
  const lastSeen = latest ? new Date(latest.last_seen_at) : undefined;
  const eligible = live.filter(
    (row) =>
      row.state !== "draining" &&
      (!options.operation ||
        (typeof row.capabilities === "object" &&
          row.capabilities !== null &&
          (row.capabilities as Record<string, unknown>)[options.operation] ===
            true)),
  );
  const busy = live.filter(
    (row) =>
      row.state === "busy" ||
      (row.state === "draining" && currentJob(row) !== null),
  );
  const visibleJob =
    busy
      .map(currentJob)
      .find(
        (job) =>
          job &&
          (options.allowedChangeRequestID === undefined ||
            job.changeRequestID === options.allowedChangeRequestID),
      ) ?? null;
  const base: WorkerAvailabilityDTO = {
    state: "unavailable",
    reason:
      "Исполнитель ещё не подключался. Задание останется в очереди до запуска сервиса.",
    lastSeenAt:
      lastSeen && Number.isFinite(lastSeen.getTime())
        ? lastSeen.toISOString()
        : null,
    activeCount: live.length,
    busyCount: busy.length,
    currentJob: visibleJob,
  };
  if (!snapshot.readable)
    return {
      ...base,
      reason:
        "Не удалось прочитать состояние исполнителя. Проверьте базу данных и миграции.",
    };
  if (options.assignedInstanceKey && !visibleJob)
    return {
      ...base,
      reason:
        "Исполнитель текущего задания не подтверждает его выполнение. Автоматический повтор не выполняется; проверьте сервис.",
    };
  // Изменение разрешений следующего claim не меняет подтверждённое выполнение уже занятого экземпляра.
  if (options.assignedInstanceKey && visibleJob)
    return {
      ...base,
      state: "busy",
      reason: live.some((row) => row.state === "draining")
        ? "Исполнитель завершает текущее задание и останавливается. Новые задания ожидают запуска сервиса."
        : "Исполнитель подтверждает выполнение текущего задания.",
    };
  if (options.disabledReason)
    return { ...base, reason: options.disabledReason };
  if (eligible.some((row) => row.state === "idle"))
    return {
      ...base,
      state: "available",
      reason: "Исполнитель подключён и готов забирать задания из очереди.",
    };
  if (eligible.some((row) => row.state === "busy"))
    return {
      ...base,
      state: "busy",
      reason:
        "Исполнитель выполняет задание. Очередь продолжится после его завершения.",
    };
  if (live.some((row) => row.state === "draining"))
    return {
      ...base,
      state: visibleJob && !options.operation ? "busy" : "unavailable",
      reason:
        "Исполнитель завершает текущее задание и останавливается. Новые задания ожидают запуска сервиса.",
    };
  if (live.length)
    return {
      ...base,
      reason:
        "Подключённые исполнители не принимают задания этого этапа. Проверьте настройки агента и инфраструктуру сервиса.",
    };
  if (latest?.state === "error")
    return {
      ...base,
      reason:
        "Исполнитель остановился из-за ошибки. Требуется проверить и перезапустить сервис.",
    };
  if (latest?.state === "stopped")
    return {
      ...base,
      reason:
        "Исполнитель остановлен. Задание останется в очереди до запуска сервиса.",
    };
  if (latest)
    return {
      ...base,
      reason:
        "Связь с исполнителем потеряна: свежий сигнал не поступает. Требуется проверить сервис.",
    };
  return base;
};
