/**
 * @file packages/template-contracts/src/layouts/LayoutContract.error.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Выдаёт безопасные коды и JSON pointers отказов layout contract.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { LayoutContractErrorCode } from "./LayoutDescriptor.types";

/** Значения descriptor, package paths и тексты guides не добавляются в message. */
export class LayoutContractError extends Error {
  constructor(
    readonly code: LayoutContractErrorCode,
    readonly path: string,
  ) {
    super(`Layout contract validation failed: ${code}.`);
    this.name = "LayoutContractError";
  }
}
