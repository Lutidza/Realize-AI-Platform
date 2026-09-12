/**
 * @file packages/ai-contracts/src/WorkerAvailability.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт безопасное текущее состояние фоновых исполнителей и их задания.
 */

/** Этапы, которые обслуживает общий процесс исполнения; approval остаётся отдельным контрактом. */
export type WorkerJobKind =
  "execution" | "preview" | "sourcePromotion" | "release";

/** Снимок heartbeat по времени БД; не подтверждает успех задания или доступ к модели. */
export type WorkerAvailabilityDTO = {
  state: "available" | "busy" | "unavailable";
  reason: string;
  lastSeenAt: string | null;
  activeCount: number;
  busyCount: number;
  /** В чате разрешено показывать только задание принадлежащего пользователю Change Request. */
  currentJob: { kind: WorkerJobKind; changeRequestID: string } | null;
};
