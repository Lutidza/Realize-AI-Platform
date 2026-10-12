/**
 * @file .ai/tools/git-delivery/src/merge/readGitMergeCandidate.adapter.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Читает только принятые candidate файлы через O_NOFOLLOW и проверяет точные bytes/mode/blob SHA1.
 */
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { relative } from "node:path";
import { PolicyError } from "../Policy.error.ts";
import { assertNoGitSecrets } from "../commit/assertNoGitSecrets.validator.ts";
import { hashGitBlob } from "./hashGitTree.util.ts";
import type {
  GitMergeContext,
  GitMergeCandidateBytes,
} from "./GitMerge.types.ts";

/** Не читает остальные snapshot файлы, dependencies или env; отсутствие файла допускается только для deletion. */
export async function readGitMergeCandidate(
  context: GitMergeContext,
): Promise<GitMergeCandidateBytes[]> {
  if (
    (await realpath(context.candidateSourceRoot)) !==
    context.candidateSourceRoot
  )
    throw new PolicyError(
      "merge_candidate_path_invalid",
      "Candidate root должен быть canonical path без symlink.",
    );
  const result: GitMergeCandidateBytes[] = [];
  let total = 0;
  const openCandidateRoot = async () => {
    let anchor = await open(
      context.repositoryRoot,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      for (const part of relative(
        context.repositoryRoot,
        context.candidateSourceRoot,
      ).split("/")) {
        if (!part || part === "." || part === "..")
          throw new PolicyError(
            "merge_candidate_path_invalid",
            "Candidate root выходит за границу repository.",
          );
        const next = await open(
          `/proc/self/fd/${anchor.fd}/${part}`,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        await anchor.close();
        anchor = next;
      }
      return anchor;
    } catch {
      await anchor.close();
      throw new PolicyError(
        "merge_candidate_path_invalid",
        "Candidate root/ancestor недоступен или содержит symlink.",
      );
    }
  };
  for (const entry of context.candidate.files) {
    let directory = await openCandidateRoot();
    let file: FileHandle | undefined;
    try {
      const parts = entry.path.split("/");
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
      if (
        entry.blobOid === null ||
        !stat.isFile() ||
        stat.size > 16 * 1024 * 1024 ||
        total + stat.size > 64 * 1024 * 1024 ||
        (stat.mode & 0o111 ? "100755" : "100644") !== entry.mode
      )
        throw new PolicyError(
          "merge_candidate_content_invalid",
          "Candidate mode, тип, deletion или размер не соответствует принятому снимку.",
        );
      const bytes = Buffer.alloc(stat.size + 1);
      let size = 0;
      while (size < bytes.length) {
        const next = await file.read(bytes, size, bytes.length - size, null);
        if (!next.bytesRead) break;
        size += next.bytesRead;
      }
      const after = await file.stat();
      if (
        size !== stat.size ||
        stat.ino !== after.ino ||
        stat.mode !== after.mode ||
        stat.mtimeMs !== after.mtimeMs ||
        stat.ctimeMs !== after.ctimeMs
      )
        throw new PolicyError(
          "merge_candidate_content_invalid",
          "Candidate файл изменился во время чтения.",
        );
      const exact = bytes.subarray(0, size);
      if (hashGitBlob(exact) !== entry.blobOid)
        throw new PolicyError(
          "merge_candidate_blob_changed",
          "Candidate bytes не совпадают с принятым Git blob SHA1.",
        );
      assertNoGitSecrets(exact);
      total += size;
      result.push({ ...entry, bytes: exact });
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === "ENOENT" &&
        entry.blobOid === null
      )
        result.push({ ...entry, bytes: null });
      else if (error instanceof PolicyError) throw error;
      else
        throw new PolicyError(
          "merge_candidate_path_invalid",
          "Candidate путь недоступен, отсутствует или содержит symlink.",
        );
    } finally {
      await file?.close();
      await directory.close();
    }
  }
  return result;
}
