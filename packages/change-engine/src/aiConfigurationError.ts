/**
 * @file packages/change-engine/src/aiConfigurationError.ts
 * @version 2026-09-01
 * @description Задаёт bounded domain error configuration validation и compilation.
 * @docref Realize AI Commerce v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { AIConfigValidationIssue } from "@realize/ai-contracts";

/** Ошибка policy с безопасным списком machine-readable validation issues. */
export class AIConfigurationPolicyError extends Error {
  readonly issues: readonly AIConfigValidationIssue[];

  constructor(
    message: string,
    issues: readonly AIConfigValidationIssue[] = [],
  ) {
    super(message);
    this.name = "AIConfigurationPolicyError";
    this.issues = issues;
  }
}
