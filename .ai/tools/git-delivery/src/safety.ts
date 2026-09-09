/**
 * @file .ai/tools/git-delivery/src/safety.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Сохраняет публичные экспорты проверок локального Git-протокола.
 */
export { validateChanges } from "./commit/validateGitChanges.validator.ts";
export { assertIndexScope } from "./commit/assertGitIndexScope.adapter.ts";
export { verifyStaged } from "./commit/verifyGitStaged.adapter.ts";
