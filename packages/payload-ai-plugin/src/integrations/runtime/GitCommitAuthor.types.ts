/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/GitCommitAuthor.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет результат чтения автора из основной GitHub-интеграции.
 */

import type { GitCommitAuthor } from "@realize/ai-contracts";

/** Ревизия фиксирует прочитанную настройку; результат не является разрешением commit. */
export type RuntimeGitCommitAuthor =
  | { state: "absent" | "disabled" | "unconfigured" }
  | {
      state: "ready";
      author: GitCommitAuthor;
      connectionKey: "github:primary";
      revision: number;
    };

/** Читает актуальное авторство без получения GitHub credential. */
export interface GitCommitAuthorResolver {
  resolvePrimaryGitCommitAuthor(): Promise<RuntimeGitCommitAuthor>;
}
