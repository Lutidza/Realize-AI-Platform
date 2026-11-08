/**
 * @file .ai/tools/agent-search/src/styleModuleTarget.util.mjs
 * @version 1.0.0
 * @date 2026-10-29
 * @description Сохраняет extension style module specifier для relative и alias relocation без собственного resolution.
 * @see documentation/architecture/repository-search.md
 */
import { posix } from "node:path";
import { isSyntaxSearchFile } from "./syntaxSearch.config.mjs";

/** Кандидат всегда повторно проверяется общим resolver; функция не доказывает существование. */
export function styleModuleTarget(target, sourceSpecifier) {
  const extension = (path) =>
    isSyntaxSearchFile(path) ? posix.extname(path) : "";
  const targetExtension = extension(target);
  return (
    (targetExtension ? target.slice(0, -targetExtension.length) : target) +
    extension(sourceSpecifier)
  );
}
