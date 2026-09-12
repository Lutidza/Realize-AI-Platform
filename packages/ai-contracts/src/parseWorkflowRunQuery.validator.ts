/**
 * @file packages/ai-contracts/src/parseWorkflowRunQuery.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет ограниченные параметры поиска и пагинации истории процессов.
 */

import type {
  WorkflowRegistryStatus,
  WorkflowRunListQuery,
  WorkflowRunOptionsQuery,
} from "./WorkflowRunRegistry.types";
import { parseStableKey } from "./aiConfigurationParsingSupport";
import { ContractValidationError } from "./validation";

const statuses: readonly WorkflowRegistryStatus[] = [
  "queued",
  "running",
  "ready",
  "awaiting_input",
  "completed",
  "blocked",
  "failed",
  "cancelled",
];

const validateKeys = (
  params: URLSearchParams,
  allowed: readonly string[],
): void => {
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1)
      throw new ContractValidationError(
        `Неизвестный или повторный параметр: ${key}.`,
      );
  }
};

const integer = (
  params: URLSearchParams,
  key: string,
  fallback: number,
  max: number,
): number => {
  const value = params.get(key);
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > max)
    throw new ContractValidationError(
      `${key} должен быть целым числом от 1 до ${max}.`,
    );
  return Number(value);
};

const search = (params: URLSearchParams): string | undefined => {
  const value = params.get("query")?.trim();
  if (value && (value.length > 200 || /[\u0000-\u001f]/.test(value)))
    throw new ContractValidationError(
      "Поиск ограничен 200 символами без управляющих знаков.",
    );
  return value || undefined;
};

const date = (params: URLSearchParams, key: string): string | undefined => {
  const value = params.get(key);
  if (value === null) return undefined;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    value.startsWith("0000-")
  )
    throw new ContractValidationError(`${key} должен содержать дату ISO UTC.`);
  const parsed = new Date(value);
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== normalized)
    throw new ContractValidationError(`Некорректная дата ${key}.`);
  return normalized;
};

/** Один и тот же browser-safe parser обслуживает URL состояния UI и HTTP query. */
export const parseWorkflowRunListQuery = (
  params: URLSearchParams,
): WorkflowRunListQuery => {
  validateKeys(params, [
    "page",
    "pageSize",
    "query",
    "workflowKey",
    "profileKey",
    "status",
    "createdFrom",
    "createdTo",
  ]);
  const status = params.get("status");
  if (status !== null && !statuses.includes(status as WorkflowRegistryStatus))
    throw new ContractValidationError("Неизвестный статус процесса.");
  const createdFrom = date(params, "createdFrom");
  const createdTo = date(params, "createdTo");
  if (createdFrom && createdTo && createdFrom >= createdTo)
    throw new ContractValidationError(
      "Конец периода должен быть позже начала.",
    );
  const workflowKey = params.get("workflowKey");
  const profileKey = params.get("profileKey");
  return {
    page: integer(params, "page", 1, 1_000_000),
    pageSize: integer(params, "pageSize", 25, 50),
    ...(search(params) ? { query: search(params) } : {}),
    ...(workflowKey === null
      ? {}
      : { workflowKey: parseStableKey(workflowKey, "workflowKey") }),
    ...(profileKey === null
      ? {}
      : { profileKey: parseStableKey(profileKey, "profileKey") }),
    ...(status === null ? {} : { status: status as WorkflowRegistryStatus }),
    ...(createdFrom ? { createdFrom } : {}),
    ...(createdTo ? { createdTo } : {}),
  };
};

export const parseWorkflowRunOptionsQuery = (
  params: URLSearchParams,
): WorkflowRunOptionsQuery => {
  validateKeys(params, ["kind", "page", "pageSize", "query"]);
  const kind = params.get("kind");
  if (kind !== "workflow" && kind !== "profile")
    throw new ContractValidationError("kind должен быть workflow или profile.");
  return {
    kind,
    page: integer(params, "page", 1, 1_000_000),
    pageSize: integer(params, "pageSize", 25, 50),
    ...(search(params) ? { query: search(params) } : {}),
  };
};
