/**
 * @file .ai/tools/engineering/src/ProjectArtifact.error.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Возвращает ограниченные ошибки классификации и native metadata без приватных данных.
 * @see documentation/architecture/engineering-artifacts.md
 */
import { EngineeringFailure } from "@realize/engineering-runtime";

/** Отказ до apply: отсутствующий resolver не превращается в неполный успешный план. */
export class ProjectArtifactError extends EngineeringFailure {
  constructor(
    code: "INVALID_INPUT" | "UNSUPPORTED" | "CONFLICT" | "LIMIT_EXCEEDED",
    message: string,
  ) {
    super(code, message, "planning");
    this.name = "ProjectArtifactError";
  }
}
