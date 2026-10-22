/**
 * @file .ai/tools/git-delivery/src/read/readGitMetadata.adapter.ts
 * @version 1.1.2
 * @date 2026-10-22
 * @description Читает только имена, режимы и object IDs без содержимого исторических файлов.
 */
import { Git } from "@realize/git-runtime";
import { RepositoryReadError } from "../../../../../services/ai-control-plane/src/RepositoryRead.error";
import { hashRepositorySnapshot } from "../../../../../services/ai-control-plane/src/RepositoryCursor.service";
import type { GitReadContext, GitReadEntry } from "./GitRead.types";
import { readGitHead } from "./readGitHead.adapter";

/** Проверяет Git dependency по ограниченным metadata, без обхода и хеширования файлов checkout. */
export async function probeGitRead(context: GitReadContext): Promise<void> {
  await readGitHead(context);
}

export async function readGitMetadata(context: GitReadContext) {
  const git = new Git(context.policy.root, {
    timeoutMs: 10000,
    maxOutputBytes: 4 * 1024 * 1024,
  });
  const run = (args: string[]) =>
    git.run(args, { machineRead: true, signal: context.signal });
  const { head, branch } = await readGitHead(context);
  const objectFormat = (
    await run(["rev-parse", "--show-object-format"])
  ).trim();
  if (!["sha1", "sha256"].includes(objectFormat))
    throw new RepositoryReadError(
      "FORBIDDEN",
      "Формат объектов Git не поддерживается.",
    );
  const parse = (raw: string, kind: "index" | "head"): GitReadEntry[] => {
    if (!raw) return [];
    if (!raw.endsWith("\0"))
      throw new RepositoryReadError("CONFLICT", "Неполные metadata Git.");
    const records = raw.slice(0, -1).split("\0");
    if (records.length > 10000)
      throw new RepositoryReadError(
        "RESULT_LIMIT",
        "Слишком много записей Git.",
      );
    return records.map((record) => {
      const match = (
        kind === "index"
          ? /^(\d{6}) ([a-f0-9]+) ([0-3])\t([\s\S]+)$/
          : /^(\d{6}) (?:blob|commit) ([a-f0-9]+)\t([\s\S]+)$/
      ).exec(record);
      if (!match)
        throw new RepositoryReadError("CONFLICT", "Недопустимые metadata Git.");
      return {
        path: kind === "index" ? match[4] : match[3],
        mode: match[1],
        oid: match[2],
        stage: kind === "index" ? Number(match[3]) : 0,
      };
    });
  };
  const index = parse(await run(["ls-files", "--stage", "-z"]), "index");
  const tree = head
    ? parse(await run(["ls-tree", "-r", "--full-tree", "-z", head]), "head")
    : [];
  return {
    git,
    head,
    branch,
    objectFormat,
    index,
    tree,
    metadataHash: hashRepositorySnapshot([head, branch, index, tree]),
  };
}
