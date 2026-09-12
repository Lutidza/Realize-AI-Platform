/**
 * @file packages/change-engine/src/ChangePlan.error.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Обозначает отказ в подготовке безопасного плана изменения кода.
 */

/** Ответ ассистента нельзя передать на подтверждение как план изменения кода. */
export class ChangePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChangePlanError";
  }
}
