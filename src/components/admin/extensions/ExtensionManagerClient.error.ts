/**
 * @file src/components/admin/extensions/ExtensionManagerClient.error.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Различает подтверждённый API отказ и неизвестный исход mutation для безопасного retry.
 */

/** Unknown outcome сохраняет frozen UUID/payload; подтверждённый отказ разрешает исправить draft. */
export class ExtensionManagerClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly certainty: "rejected" | "unknown",
  ) {
    super(message);
    this.name = "ExtensionManagerClientError";
  }
}
