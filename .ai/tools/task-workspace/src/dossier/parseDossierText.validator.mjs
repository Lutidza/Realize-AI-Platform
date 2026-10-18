/**
 * @file .ai/tools/task-workspace/src/dossier/parseDossierText.validator.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Разбирает TASK из текста по единому контракту frontmatter без файловых операций.
 * @see documentation/specifications/task-management-execution.md
 */
import YAML from "yaml";
import { workspaceTaskSchema } from "@realize/payload-task-manager/workspace-contracts";
import { fail } from "../Workspace.error.mjs";

/**
 * Legacy сохраняется целиком; managed TASK запрещает дубли ключей, aliases и чужой localKey.
 * Один parser используется чтением досье и проверкой подготовленных metadata до записи.
 * @param {string} text
 * @param {string} key
 * @returns {Pick<import("./Dossier.types.ts").WorkspaceDossier, "body" | "meta">}
 */
export function parseDossierText(text, key) {
  if (!text.startsWith("---\n")) return { body: text, meta: null };
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) fail("invalid_frontmatter");
  const doc = YAML.parseDocument(text.slice(4, end), { uniqueKeys: true });
  if (doc.errors.length) fail("invalid_frontmatter");
  let parsed;
  try {
    parsed = doc.toJS({ maxAliasCount: 0 });
  } catch {
    fail("invalid_frontmatter");
  }
  const meta = workspaceTaskSchema.parse(parsed);
  if (meta.localKey !== key) fail("dossier_identity_mismatch");
  return { body: text.slice(end + 5), meta };
}
