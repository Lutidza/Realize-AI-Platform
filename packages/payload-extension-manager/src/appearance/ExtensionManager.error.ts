/**
 * @file packages/payload-extension-manager/src/appearance/ExtensionManager.error.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Возвращает безопасные machine-readable ошибки без данных actor/settings.
 */
import type { ExtensionManagerErrorCode } from "./ExtensionAppearance.types";

/** Message не формируется из exception/provider/user input и безопасен для публичного ответа. */
export class ExtensionManagerError extends Error {
  readonly status: number;
  constructor(readonly code: ExtensionManagerErrorCode) {
    super(`Операция оформления отклонена: ${code}.`);
    this.name = "ExtensionManagerError";
    this.status =
      code === "PLAN_ACTOR_MISMATCH"
        ? 403
        : code === "PLAN_NOT_FOUND"
          ? 404
          : code === "PLAN_EXPIRED"
            ? 410
            : [
                  "INVALID_STORE",
                  "INVALID_CATALOG",
                  "INVALID_POLICY",
                  "LIMIT_REACHED",
                ].includes(code)
              ? 503
              : ["INVALID_INPUT", "INVALID_SETTINGS"].includes(code)
                ? 400
                : 409;
  }
}
