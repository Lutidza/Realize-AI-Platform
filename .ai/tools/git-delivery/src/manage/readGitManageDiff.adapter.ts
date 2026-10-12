/**
 * @file .ai/tools/git-delivery/src/manage/readGitManageDiff.adapter.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Строит безопасный diff из blob и буквальных рабочих bytes без clean filters и symlink-переходов.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { Git } from "../Git.adapter.ts";
import { PolicyError } from "../Policy.error.ts";
import { relativeFile } from "../contracts.ts";
import { assertNoGitSecrets } from "../commit/assertNoGitSecrets.validator.ts";
import { createGitReadPatch } from "../read/createGitReadPatch.adapter.ts";
import type {
  GitManageDiffEntry,
  GitManageOperation,
  GitManageWorkingContent,
} from "./GitManage.types.ts";

const MAX_CONTENT = 1024 * 1024;
async function workingContent(
  root: string,
  path: string,
): Promise<GitManageWorkingContent | null> {
  let directory = await open(
    root,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  let file: FileHandle | undefined;
  try {
    const parts = path.split("/");
    for (const part of parts.slice(0, -1)) {
      const next = await open(
        `/proc/self/fd/${directory.fd}/${part}`,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      await directory.close();
      directory = next;
    }
    file = await open(
      `/proc/self/fd/${directory.fd}/${parts.at(-1)}`,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_CONTENT)
      throw new PolicyError(
        "manage_diff_content_invalid",
        "Diff поддерживает обычные файлы до 1 MiB.",
      );
    const bytes = Buffer.alloc(MAX_CONTENT + 1);
    let size = 0;
    while (size < bytes.length) {
      const read = await file.read(bytes, size, bytes.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    const after = await file.stat();
    if (
      size > MAX_CONTENT ||
      stat.size !== size ||
      stat.mode !== after.mode ||
      stat.mtimeMs !== after.mtimeMs ||
      stat.ctimeMs !== after.ctimeMs
    )
      throw new PolicyError(
        "manage_diff_content_invalid",
        "Рабочий файл изменился или превысил лимит.",
      );
    return {
      bytes: bytes.subarray(0, size),
      mode: stat.mode & 0o111 ? "100755" : "100644",
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof PolicyError) throw error;
    throw new PolicyError(
      "manage_diff_content_invalid",
      "Рабочий путь недоступен или содержит symlink.",
    );
  } finally {
    await file?.close();
    await directory.close();
  }
}

/** Ограничивает входные blobs, общий объём и patch; повторное чтение обнаруживает смену снимка. */
export async function readGitManageDiff(
  git: Git,
  operation: Extract<GitManageOperation, { kind: "diff" }>,
): Promise<string> {
  const indexRaw = await git.run(
    ["ls-files", "--stage", "-z", "--", ...operation.paths],
    { machineRead: true },
  );
  const headRaw =
    operation.scope === "index"
      ? await git.run(
          ["ls-tree", "-r", "-z", "HEAD", "--", ...operation.paths],
          { machineRead: true },
        )
      : "";
  const parse = (raw: string, index: boolean) => {
    const result = new Map<string, GitManageDiffEntry>();
    for (const value of raw.split("\0").filter(Boolean)) {
      const match = (
        index
          ? /^(\d{6}) ([a-f0-9]{40}) 0\t([\s\S]+)$/
          : /^(\d{6}) blob ([a-f0-9]{40})\t([\s\S]+)$/
      ).exec(value);
      if (!match || !["100644", "100755"].includes(match[1]))
        throw new PolicyError(
          "manage_diff_content_invalid",
          "Diff не поддерживает unmerged, submodules или symlink.",
        );
      result.set(relativeFile(match[3]), { mode: match[1], oid: match[2] });
    }
    return result;
  };
  const index = parse(indexRaw, true);
  const head = parse(headRaw, false);
  const paths = [...new Set([...index.keys(), ...head.keys()])].sort();
  if (paths.length > 2000)
    throw new PolicyError(
      "manage_output_limit",
      "Сузьте пути diff; превышен предел файлов.",
    );
  let total = 0;
  let patch = "";
  const working = new Map<string, string>();
  const digest = (bytes: Buffer | null) =>
    bytes === null
      ? "absent"
      : createHash("sha256").update(bytes).digest("hex");
  const blob = async (entry?: GitManageDiffEntry): Promise<Buffer | null> => {
    if (!entry) return null;
    const size = Number(
      (
        await git.run(["cat-file", "-s", entry.oid], { machineRead: true })
      ).trim(),
    );
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_CONTENT)
      throw new PolicyError(
        "manage_diff_content_invalid",
        "Blob превышает 1 MiB.",
      );
    return git.runBytes(["cat-file", "blob", entry.oid], { machineRead: true });
  };
  const quote = (value: string) =>
    /^[A-Za-z0-9_./-]+$/.test(value) ? value : JSON.stringify(value);
  for (const path of paths) {
    const beforeEntry =
      operation.scope === "index" ? head.get(path) : index.get(path);
    const before = await blob(beforeEntry);
    const workingFile =
      operation.scope === "working-tree"
        ? await workingContent(git.root, path)
        : null;
    const after =
      operation.scope === "index"
        ? await blob(index.get(path))
        : (workingFile?.bytes ?? null);
    const beforeMode = beforeEntry?.mode;
    const afterMode =
      operation.scope === "index" ? index.get(path)?.mode : workingFile?.mode;
    if (operation.scope === "working-tree")
      working.set(path, `${digest(after)}:${afterMode ?? "absent"}`);
    total += (before?.length ?? 0) + (after?.length ?? 0);
    if (total > 16 * 1024 * 1024)
      throw new PolicyError(
        "manage_output_limit",
        "Сузьте пути diff; превышен предел входных bytes.",
      );
    for (const bytes of [before, after])
      if (bytes) {
        assertNoGitSecrets(bytes);
        if (bytes.includes(0))
          throw new PolicyError(
            "manage_diff_content_invalid",
            "Binary diff недоступен.",
          );
      }
    const sameBytes = digest(before) === digest(after);
    const sameMode = beforeMode === afterMode;
    if (sameBytes && sameMode) continue;
    let contentPatch = (
      await createGitReadPatch(path, before, after, operation.contextLines)
    ).join("");
    const header = `diff --git ${quote(`a/${path}`)} ${quote(`b/${path}`)}\n`;
    const modePatch =
      beforeMode && afterMode && !sameMode
        ? `old mode ${beforeMode}\nnew mode ${afterMode}\n`
        : beforeMode && !afterMode
          ? `deleted file mode ${beforeMode}\n`
          : !beforeMode && afterMode
            ? `new file mode ${afterMode}\n`
            : "";
    if (modePatch)
      contentPatch = contentPatch
        ? contentPatch.replace(header, header + modePatch)
        : header + modePatch;
    patch += contentPatch;
    if (Buffer.byteLength(patch) > operation.limitBytes)
      throw new PolicyError(
        "manage_output_limit",
        "Diff превышает разрешённый размер; сузьте пути.",
      );
  }
  if (
    indexRaw !==
      (await git.run(["ls-files", "--stage", "-z", "--", ...operation.paths], {
        machineRead: true,
      })) ||
    (operation.scope === "index" &&
      headRaw !==
        (await git.run(
          ["ls-tree", "-r", "-z", "HEAD", "--", ...operation.paths],
          { machineRead: true },
        )))
  )
    throw new PolicyError(
      "manage_repository_changed",
      "Git изменился во время чтения diff.",
    );
  for (const [path, digestBefore] of working) {
    const content = await workingContent(git.root, path);
    if (
      digestBefore !==
      `${digest(content?.bytes ?? null)}:${content?.mode ?? "absent"}`
    )
      throw new PolicyError(
        "manage_repository_changed",
        "Рабочий файл изменился во время diff.",
      );
  }
  assertNoGitSecrets(Buffer.from(patch));
  return patch;
}
