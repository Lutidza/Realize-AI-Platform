/**
 * @file packages/change-engine/src/deriveChangePlan.service.ts
 * @version 2.0.1
 * @date 2026-09-15
 * @description Готовит ограниченный план изменения кода и исключает операции с данными.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import { createHash } from "node:crypto";
import { assessChangePlanReadiness } from "./assessChangePlanReadiness.validator";
import { ChangePlanError } from "./ChangePlan.error";
import type {
  DerivedChangePlan,
  DeriveChangePlanInput,
} from "./DerivedChangePlan.types";
import { extractChangePlanPaths } from "./extractChangePlanPaths.util";

const NPM_CHECK = /\bnpm run [a-z0-9:_-]+\b/gi;
const DEFAULT_CODE_CHECKS = [
  "node scripts/security/check-secrets.mjs",
  "npm run lint",
  "npm run typecheck",
  "npm run test:int",
  "npm run build",
] as const;

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const classify = (
  plan: string,
  paths: string[],
): Pick<DerivedChangePlan, "riskLevel" | "type"> => {
  const normalized = plan.toLocaleLowerCase("ru");
  if (
    paths.some((path) => path.startsWith("src/migrations/")) ||
    /\b(schema|migration|миграц|схем[аы]|collection)\b/u.test(normalized)
  ) {
    return { riskLevel: "R3", type: "SCHEMA_CHANGE" };
  }
  if (paths.every((path) => path.startsWith("documentation/"))) {
    return { riskLevel: "R3", type: "AGENCY_ENGINEERING_REQUEST" };
  }
  return { riskLevel: "R3", type: "CODE_CHANGE" };
};

/** Data Lane proposal, в том числе повреждённый, не становится разрешением на code execution. */
export const deriveChangePlan = (
  input: DeriveChangePlanInput,
): DerivedChangePlan => {
  const plan = input.plan.trim();
  const originalRequest = input.originalRequest.trim();
  const readiness = assessChangePlanReadiness(plan);
  if (readiness.status === "unavailable") {
    throw new ChangePlanError(
      "Ответ содержит операцию с данными CMS. Используйте «Подготовить изменение данных»; создавать план изменения кода для этого ответа нельзя.",
    );
  }
  if (readiness.status === "needs_clarification") {
    throw new ChangePlanError(
      readiness.reason === "too_short"
        ? "План слишком короткий. Попросите ассистента перечислить шаги, пути и проверки."
        : "В ответе нет корректного плана изменения файлов. Попросите ассистента подготовить явный список файлов с описанием каждой правки; ссылки на прочитанные источники не задают область изменения.",
    );
  }
  const affectedPaths = extractChangePlanPaths(plan);
  const detectedChecks = plan
    .match(NPM_CHECK)
    ?.map((value) => value.toLocaleLowerCase("en-US"));
  const classification = classify(plan, affectedPaths);
  const additionalChecks = [
    ...(classification.type === "SCHEMA_CHANGE"
      ? ["npm run payload:migrate:status"]
      : []),
    ...(detectedChecks || []),
  ].sort();
  // Обязательные проверки сохраняют порядок от быстрых к сборке; дополнительные не зависят от порядка упоминаний.
  const checks = [...new Set([...DEFAULT_CODE_CHECKS, ...additionalChecks])];
  const normalizedIntent = originalRequest.replace(/\s+/g, " ").slice(0, 500);
  const title = (normalizedIntent || "Изменение из AI-диалога").slice(0, 120);
  return {
    ...classification,
    affectedPaths,
    checks,
    normalizedIntent,
    planHash: sha256(plan),
    scopeHash: sha256(JSON.stringify({ affectedPaths, checks })),
    title,
  };
};
