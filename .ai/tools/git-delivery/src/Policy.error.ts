/**
 * @file .ai/tools/git-delivery/src/Policy.error.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Представляет безопасный отказ проверки контракта или инварианта Git-операции.
 */

/** Код и безопасное сообщение допускаются в результате без исходных закрытых данных. */
export class PolicyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PolicyError";
    this.code = code;
  }
}
