/**
 * @file packages/change-engine/src/DerivedChangePlan.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт проекцию сохранённого ответа для подтверждения изменения кода.
 */

import type { ChangeRequestType, ChangeRiskLevel } from "@realize/ai-contracts";

/** Неизменяемые поля плана, связанные с исходным текстом и областью проверки. */
export type DerivedChangePlan = {
  affectedPaths: string[];
  checks: string[];
  normalizedIntent: string;
  planHash: string;
  riskLevel: ChangeRiskLevel;
  scopeHash: string;
  title: string;
  type: ChangeRequestType;
};

export type DeriveChangePlanInput = {
  originalRequest: string;
  plan: string;
};
