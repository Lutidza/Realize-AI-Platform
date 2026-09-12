/**
 * @file packages/ai-contracts/src/parseCodexAgentSettings.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет полную замену параметров агента и ограниченные сроки действия операций.
 * @see documentation/architecture/codex-integration.md
 */

import type {
  CodexAgentSettingsDTO,
  SaveCodexAgentSettingsInput,
} from "./CodexAgentSettings.types";
import { ContractValidationError } from "./validation";

const objectOf = (
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new ContractValidationError(
      "Настройки агента должны содержать только поддерживаемые поля JSON.",
    );
  return value as Record<string, unknown>;
};
const booleanOf = (value: unknown): boolean => {
  if (typeof value !== "boolean")
    throw new ContractValidationError(
      "Переключатели агента должны быть логическими значениями.",
    );
  return value;
};
const ttlOf = (value: unknown, minimum: number): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > 604800
  )
    throw new ContractValidationError(
      `Срок действия должен быть целым числом от ${minimum} до 604800 секунд.`,
    );
  return value;
};

/** Принимает идентификатор модели и явные параметры; пути, команды и credentials запрещены. */
export const parseCodexAgentSettings = (
  value: unknown,
): CodexAgentSettingsDTO => {
  const input = objectOf(value, [
    "model",
    "reviewModel",
    "execution",
    "preview",
    "release",
    "sourcePromotion",
  ]);
  const validModel = (model: unknown): model is string =>
    typeof model === "string" &&
    (model.trim() === "" ||
      /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model.trim()));
  if (!validModel(input.model) || !validModel(input.reviewModel))
    throw new ContractValidationError(
      "Укажите идентификатор модели длиной до 128 символов или оставьте поле пустым.",
    );
  const execution = objectOf(input.execution, [
    "enabled",
    "capabilityTTLSeconds",
    "artifactsTTLSeconds",
  ]);
  const preview = objectOf(input.preview, ["enabled", "ttlSeconds"]);
  const release = objectOf(input.release, ["enabled", "ttlSeconds"]);
  const sourcePromotion = objectOf(input.sourcePromotion, ["enabled"]);
  return {
    model: input.model.trim(),
    reviewModel: input.reviewModel.trim(),
    execution: {
      enabled: booleanOf(execution.enabled),
      capabilityTTLSeconds: ttlOf(execution.capabilityTTLSeconds, 60),
      artifactsTTLSeconds: ttlOf(execution.artifactsTTLSeconds, 3600),
    },
    preview: {
      enabled: booleanOf(preview.enabled),
      ttlSeconds: ttlOf(preview.ttlSeconds, 900),
    },
    release: {
      enabled: booleanOf(release.enabled),
      ttlSeconds: ttlOf(release.ttlSeconds, 3600),
    },
    sourcePromotion: { enabled: booleanOf(sourcePromotion.enabled) },
  };
};

/** Сохранение выполняется только относительно известной ревизии и не применяет defaults к неполному запросу. */
export const parseSaveCodexAgentSettingsInput = (
  value: unknown,
): SaveCodexAgentSettingsInput => {
  const input = objectOf(value, ["expectedRevision", "enabled", "settings"]);
  if (
    typeof input.expectedRevision !== "number" ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= Number.MAX_SAFE_INTEGER
  )
    throw new ContractValidationError(
      "Некорректное значение expectedRevision.",
    );
  return {
    expectedRevision: input.expectedRevision,
    enabled: booleanOf(input.enabled),
    settings: parseCodexAgentSettings(input.settings),
  };
};
