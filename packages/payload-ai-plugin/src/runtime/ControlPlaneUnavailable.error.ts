/**
 * @file packages/payload-ai-plugin/src/runtime/ControlPlaneUnavailable.error.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Передаёт безопасную ошибку серверного транспорта без remote body и путей.
 */
export class ControlPlaneUnavailableError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ControlPlaneUnavailableError";
  }
}
