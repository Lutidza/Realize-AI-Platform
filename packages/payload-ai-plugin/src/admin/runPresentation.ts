/**
 * @file packages/payload-ai-plugin/src/admin/runPresentation.ts
 * @version 2026-08-18
 * @description Maps browser run lifecycle state to concise Russian Admin copy.
 */

import type { RunStreamPhase } from "./runStreamTypes";

const phaseLabels: Record<RunStreamPhase, string> = {
  connecting: "подключение",
  finalizing: "сохранение ответа",
  idle: "нет запуска",
  reconnecting: "восстановление связи",
  streaming: "формирование ответа",
  "sync-error": "обновление истории",
  waiting: "анализ проекта",
};

/** Returns stable user-facing copy for a transport lifecycle phase. */
export const runPhaseLabel = (phase: RunStreamPhase): string =>
  phaseLabels[phase];

/** Formats elapsed run time without locale-dependent punctuation. */
export const formatRunElapsed = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};
