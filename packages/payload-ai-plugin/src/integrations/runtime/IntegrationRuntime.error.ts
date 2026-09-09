/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/IntegrationRuntime.error.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Определяет ошибку конфигурации, блокирующую выполнение интеграции.
 */

/** Ошибка сохранённой конфигурации блокирует операцию, а не запускает повтор. */
export class IntegrationRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationRuntimeError";
  }
}
