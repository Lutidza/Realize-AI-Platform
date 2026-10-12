/**
 * @file packages/template-contracts/src/TemplateContract.error.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Представляет предсказуемый отказ manifest или выбора шаблона.
 */

import type { TemplateContractErrorCode } from "./TemplateManifest.types";

/** Стабильный machine-readable код для host; установка и recovery сюда не входят. */
export class TemplateContractError extends Error {
  constructor(readonly code: TemplateContractErrorCode) {
    super(`Template contract rejected: ${code}`);
    this.name = "TemplateContractError";
  }
}
