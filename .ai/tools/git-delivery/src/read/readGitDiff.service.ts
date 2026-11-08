/**
 * @file .ai/tools/git-delivery/src/read/readGitDiff.service.ts
 * @version 1.0.2
 * @date 2026-11-08
 * @description Читает точные стороны diff и выдаёт полные hunks в одном проверяемом снимке.
 */
import { createHash } from "node:crypto";
import type { McpToolInput } from "../../../../../packages/ai-contracts/src/McpTool.types";
import { RepositoryReadError } from "../../../../../services/ai-control-plane/src/RepositoryRead.error";
import { decodeRepositoryContent } from "../../../../../services/ai-control-plane/src/readRepositoryFile.service";
import { Git } from "@realize/git-runtime";
import type {
  GitContentIdentity,
  GitReadContext,
  GitReadDiffFile,
  GitReadEntry,
} from "./GitRead.types";
import { captureGitReadSnapshot } from "./captureGitReadSnapshot.service";
import { createGitReadPatch } from "./createGitReadPatch.adapter";

export async function readGitDiff(
  context: GitReadContext,
  input: McpToolInput<"repo_git_diff">,
) {
  const paths = [...input.paths].sort();
  const snapshot = await captureGitReadSnapshot(context, paths);
  const git = new Git(context.policy.root, {
    timeoutMs: 10000,
    maxOutputBytes: 2 * 1024 * 1024 + 1,
  });
  const blob = async (
    entry: GitReadEntry | null,
    source: "head" | "index",
  ): Promise<{
    bytes: Buffer | null;
    identity: GitContentIdentity;
    binary?: boolean;
  }> => {
    if (!entry) return { bytes: null, identity: { source: "absent" } };
    const size = Number(
      await git.run(["cat-file", "-s", entry.oid], {
        machineRead: true,
        signal: context.signal,
      }),
    );
    if (!Number.isSafeInteger(size) || size > 2 * 1024 * 1024)
      throw new RepositoryReadError(
        "RESULT_LIMIT",
        "Исторический файл превышает 2 MiB.",
      );
    const bytes = await git.runBytes(["cat-file", "blob", entry.oid], {
      machineRead: true,
      signal: context.signal,
    });
    const { binary } = decodeRepositoryContent(bytes, true);
    return {
      bytes,
      binary,
      identity: {
        source,
        blobOID: entry.oid,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    };
  };
  const items: GitReadDiffFile[] = [];
  for (const file of snapshot.files) {
    const omitted = file.conflicted
      ? "unmerged"
      : !file.head && !file.index
        ? "untracked"
        : null;
    if (omitted) {
      items.push({
        path: file.path,
        before: { source: "unavailable", reason: omitted },
        after: { source: "unavailable", reason: omitted },
        status: omitted,
        omittedReason: omitted,
        patch: "",
      });
      continue;
    }
    const before = await blob(
      input.scope === "index" ? file.head : file.index,
      input.scope === "index" ? "head" : "index",
    );
    const after =
      input.scope === "index"
        ? await blob(file.index, "index")
        : {
            bytes: file.working?.bytes ?? null,
            binary: file.binary,
            identity: file.working
              ? {
                  source: "working_tree" as const,
                  sha256: file.working.sha256,
                  byteLength: file.working.bytes.length,
                }
              : { source: "absent" as const },
          };
    if (before.binary || after.binary) {
      items.push({
        path: file.path,
        before: { source: "unavailable", reason: "binary" },
        after: { source: "unavailable", reason: "binary" },
        status: "binary",
        omittedReason: "binary",
        patch: "",
      });
      continue;
    }
    const patches = await createGitReadPatch(
      file.path,
      before.bytes,
      after.bytes,
      input.contextLines,
      context.signal,
    );
    const status =
      before.bytes === null
        ? "added"
        : after.bytes === null
          ? "deleted"
          : "modified";
    const beforeMode =
      input.scope === "index" ? file.head?.mode : file.index?.mode;
    const afterMode =
      input.scope === "index" ? file.index?.mode : file.working?.mode;
    if (
      !patches.length &&
      (beforeMode !== afterMode ||
        (before.bytes === null) !== (after.bytes === null))
    ) {
      patches.push(
        `diff --git a/${file.path} b/${file.path}\n${beforeMode ? `old mode ${beforeMode}\n` : ""}${afterMode ? `new mode ${afterMode}\n` : ""}`,
      );
    }
    for (const patch of patches)
      items.push({
        path: file.path,
        before: before.identity,
        after: after.identity,
        status,
        omittedReason: null,
        patch,
      });
  }
  const after = await snapshot.revalidate();
  if (
    after.snapshotHash !== snapshot.snapshotHash ||
    after.metadataHash !== snapshot.metadataHash
  )
    throw new RepositoryReadError(
      "CONFLICT",
      "Git изменился во время чтения diff.",
    );
  const binding = {
    principal: context.principal,
    policy: context.policy.version,
    query: {
      tool: "diff",
      paths,
      scope: input.scope,
      contextLines: input.contextLines,
      limitBytes: input.limitBytes,
    },
    snapshot: snapshot.snapshotHash,
  };
  const offset = context.cursors.resolve(input.cursor, binding);
  if (offset > items.length)
    throw new RepositoryReadError("INVALID_CURSOR", "Позиция diff недоступна.");
  const files: GitReadDiffFile[] = [];
  let rawBytes = 0;
  let wireBytes = 0;
  for (const file of items.slice(offset)) {
    const raw = Buffer.byteLength(file.patch);
    const wire = Buffer.byteLength(JSON.stringify(file));
    if (
      rawBytes + raw > input.limitBytes ||
      wireBytes + wire > (context.responseBytes ?? 131072) - 4096
    )
      break;
    files.push(file);
    rawBytes += raw;
    wireBytes += wire;
  }
  if (offset < items.length && files.length === 0)
    throw new RepositoryReadError(
      "RESULT_LIMIT",
      "Hunk превышает лимит; уменьшите contextLines или сузьте пути.",
    );
  const truncated = offset + files.length < items.length;
  return {
    scope: input.scope,
    snapshotHash: snapshot.snapshotHash,
    files,
    truncated,
    truncationReason: truncated ? ("response_bytes" as const) : null,
    nextCursor: truncated
      ? context.cursors.create(binding, offset + files.length)
      : null,
  };
}
