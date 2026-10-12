/**
 * @file .ai/tools/git-delivery/src/merge/validateGitMergeTrees.validator.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Доказывает точный diff candidate к target по полным GitHub trees без чтения blobs.
 */
import { relativeFile, PolicyError } from "../contracts.ts";
import type { GitMergeContext, GitMergeTree } from "./GitMerge.types.ts";
import { hashGitTree } from "./hashGitTree.util.ts";

function entries(tree: GitMergeTree, expected: string) {
  if (
    tree.sha !== expected ||
    tree.truncated !== false ||
    !Array.isArray(tree.tree) ||
    tree.tree.length > 50000
  )
    throw new PolicyError(
      "merge_tree_incomplete",
      "Нужен полный recursive tree назначенного OID.",
    );
  const result = new Map<string, string>();
  const all = new Set<string>();
  for (const item of tree.tree) {
    const path = relativeFile(item.path);
    if (
      all.has(path) ||
      !/^[a-f0-9]{40}$/.test(item.sha) ||
      /^0+$/.test(item.sha)
    )
      throw new PolicyError(
        "merge_tree_invalid",
        "Tree содержит недопустимые или повторяющиеся entries.",
      );
    all.add(path);
    const valid =
      (item.type === "tree" && item.mode === "040000") ||
      (item.type === "blob" &&
        ["100644", "100755", "120000"].includes(item.mode)) ||
      (item.type === "commit" && item.mode === "160000");
    if (!valid)
      throw new PolicyError(
        "merge_tree_invalid",
        "Tree mode и object type не согласованы.",
      );
    if (item.type !== "tree")
      result.set(path, `${item.type}:${item.mode}:${item.sha}`);
  }
  for (const path of result.keys()) {
    const parts = path.split("/");
    for (let count = 1; count < parts.length; count++)
      if (result.has(parts.slice(0, count).join("/")))
        throw new PolicyError(
          "merge_tree_invalid",
          "File entry не может быть родительским каталогом.",
        );
  }
  return result;
}

/** Добавление, удаление, content/mode/type change должны РОВНО совпасть с принятой областью. */
export function validateGitMergeTrees(
  context: GitMergeContext,
  target: GitMergeTree,
  candidate: GitMergeTree,
): void {
  const before = entries(target, context.target.treeOid);
  const after = entries(candidate, context.candidate.treeOid);
  if (
    hashGitTree(target.tree) !== context.target.treeOid ||
    hashGitTree(candidate.tree) !== context.candidate.treeOid
  )
    throw new PolicyError(
      "merge_tree_hash_invalid",
      "Leaf metadata не дают назначенный immutable tree SHA1.",
    );
  const changed = [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .sort();
  if (
    JSON.stringify(changed) !==
    JSON.stringify(context.candidate.approvedChangedPaths)
  )
    throw new PolicyError(
      "merge_tree_scope_changed",
      "Candidate изменяет другой набор путей; непринятые blob и modes должны сохраниться.",
    );
}
