/**
 * @file services/ai-execution-worker/src/SourcePromotionGitPolicy.error.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Обозначает нарушение exact source binding, запрещающее автоматический retry публикации.
 */

export class SourcePromotionGitPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourcePromotionGitPolicyError";
  }
}
