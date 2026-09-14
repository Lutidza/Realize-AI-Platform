/**
 * @file src/collections/Pages/pagePublicationValidation.error.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Обозначает уже зарегистрированный отказ проверки содержимого публикации.
 */
export class PagePublicationValidationError extends Error {
  constructor() {
    super("Публикация заблокирована проверкой содержимого.");
  }
}
