/**
 * @file .ai/tools/git-delivery/src/merge/hashGitTree.util.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Вычисляет Git SHA1 blobs/полного дерева и точный candidate overlay без Git CLI или записи.
 */
import { PolicyError } from "@realize/git-runtime";
import { createHash } from "node:crypto";
import { relativeFile } from "../contracts.ts";
import type {
  GitMergeTree,
  GitMergeCandidateFile,
  GitTreeHashNode,
} from "./GitMerge.types.ts";

function hash(kind: "blob" | "tree", bytes: Buffer): string {
  return createHash("sha1")
    .update(`${kind} ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}
/** Hash относится к точным bytes; фильтры, encodings и workspace metadata не применяются. */
export function hashGitBlob(bytes: Buffer): string {
  return hash("blob", bytes);
}

/** Поддерживает полный leaf set; Git byte sorting различает file и directory с суффиксом '/'. */
export function hashGitTree(entries: GitMergeTree["tree"]): string {
  if (entries.length > 50000)
    throw new PolicyError(
      "merge_tree_incomplete",
      "Превышен предел полного tree.",
    );
  const root: GitTreeHashNode = { children: new Map() };
  for (const item of entries.filter((entry) => entry.type !== "tree")) {
    relativeFile(item.path);
    const parts = item.path.split("/");
    if (
      parts.length > 100 ||
      !/^[a-f0-9]{40}$/.test(item.sha) ||
      /^0+$/.test(item.sha) ||
      !(
        (item.type === "blob" &&
          ["100644", "100755", "120000"].includes(item.mode)) ||
        (item.type === "commit" && item.mode === "160000")
      )
    )
      throw new PolicyError(
        "merge_tree_invalid",
        "Нужен допустимый bounded leaf set Git tree.",
      );
    let node = root;
    for (const part of parts) {
      if (node.mode !== undefined)
        throw new PolicyError(
          "merge_tree_invalid",
          "File и directory занимают один путь.",
        );
      if (!node.children.has(part))
        node.children.set(part, { children: new Map() });
      node = node.children.get(part)!;
    }
    if (node.mode !== undefined || node.children.size)
      throw new PolicyError(
        "merge_tree_invalid",
        "Повторяющийся file/directory path.",
      );
    node.mode = item.mode;
    node.sha = item.sha;
  }
  const build = (node: GitTreeHashNode): string => {
    const chunks: Buffer[] = [];
    const children = [...node.children.entries()].sort(([a, x], [b, y]) =>
      Buffer.compare(
        Buffer.from(a + (x.mode === undefined ? "/" : "")),
        Buffer.from(b + (y.mode === undefined ? "/" : "")),
      ),
    );
    for (const [name, child] of children)
      chunks.push(
        Buffer.from(`${child.mode ?? "40000"} ${name}\0`),
        Buffer.from(child.sha ?? build(child), "hex"),
      );
    return hash("tree", Buffer.concat(chunks));
  };
  return build(root);
}

/** Сохраняет все target leaves; меняются только переданные точные добавления/замены/удаления. */
export function applyGitTreeChanges(
  entries: GitMergeTree["tree"],
  changes: GitMergeCandidateFile[],
): GitMergeTree["tree"] {
  const result = new Map(
    entries
      .filter((entry) => entry.type !== "tree")
      .map((entry) => [entry.path, { ...entry }]),
  );
  for (const file of changes) {
    if (file.blobOid === null) result.delete(file.path);
    else
      result.set(file.path, {
        path: file.path,
        mode: file.mode!,
        sha: file.blobOid,
        type: "blob",
      });
  }
  return [...result.values()];
}
