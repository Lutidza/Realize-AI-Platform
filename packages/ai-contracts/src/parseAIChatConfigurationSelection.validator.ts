/**
 * @file packages/ai-contracts/src/parseAIChatConfigurationSelection.validator.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет точный выбор профиля активного выпуска без клиентских инструкций и полномочий.
 */
import type { AIChatConfigurationSelection } from "./AIChatConfiguration.types";
import { ContractValidationError } from "./validation";

export const parseAIChatConfigurationSelection = (
  value: unknown,
): AIChatConfigurationSelection => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ContractValidationError("Выберите профиль агента.");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["releaseID", "manifestHash", "profileKey"].includes(key),
    ) ||
    typeof input.releaseID !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.releaseID) ||
    typeof input.profileKey !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.profileKey) ||
    typeof input.manifestHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.manifestHash)
  ) {
    throw new ContractValidationError(
      "Некорректный выбор профиля или выпуска конфигурации.",
    );
  }
  return {
    releaseID: input.releaseID,
    manifestHash: input.manifestHash,
    profileKey: input.profileKey,
  };
};
