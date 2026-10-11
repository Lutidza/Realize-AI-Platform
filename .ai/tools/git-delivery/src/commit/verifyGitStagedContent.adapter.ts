/**
 * @file .ai/tools/git-delivery/src/commit/verifyGitStagedContent.adapter.ts
 * @version 1.1.0
 * @date 2026-10-11
 * @description Сверяет staged-пути, режимы и байты с проверенным снимком.
 */
import { createHash } from "node:crypto";
import { PolicyError } from "../Policy.error.ts";
import type { Git } from "../Git.adapter.ts";
import type { Snapshot, GitContentValidator } from "../GitSnapshot.types.ts";
import { assertIndexScope } from "./assertGitIndexScope.adapter.ts";

/** Полный разрешённый снимок допускает исчезновение diff-пути после возврата bytes к HEAD; все bytes проверяются. */
export async function verifyGitStagedContent(
  git: Git,
  snapshot: Snapshot,
  paths: string[],
  validateContent?: GitContentValidator,
  allowUnchangedPaths = false,
): Promise<void> {
  // Ослабляется только равенство состава diff: посторонние staged-пути запрещены при любом режиме.
  await assertIndexScope(git, paths, !allowUnchangedPaths);
  const entries = await git.run(["ls-files", "--stage", "-z", "--", ...paths]);
  const objects = new Map<string, { mode: number; oid: string }>();
  for (const record of entries.split("\0").filter(Boolean)) {
    const match = /^(\d{6}) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t([\s\S]+)$/.exec(
      record,
    );
    if (!match || objects.has(match[3]!))
      throw new PolicyError(
        "unmerged_index",
        "Индекс содержит неподдерживаемые записи.",
      );
    objects.set(match[3]!, {
      mode: Number.parseInt(match[1]!, 8),
      oid: match[2]!,
    });
  }
  const files = new Map(snapshot.files.map((file) => [file.path, file]));
  let total = 0;
  for (const path of paths) {
    const file = files.get(path)!;
    const object = objects.get(path);
    if (file.kind === "missing" && !object) continue;
    if (!object || file.kind === "missing" || object.mode !== file.mode) {
      throw new PolicyError(
        "staged_content_changed",
        "Режим или наличие staged-файла отличается от проверенного снимка.",
      );
    }
    const bytes = await git.runBytes(["cat-file", "blob", object.oid]);
    total += bytes.length;
    if (total > 128 * 1024 * 1024)
      throw new PolicyError(
        "staged_size_limit",
        "Объём staged-данных превышает предел.",
      );
    if (createHash("sha256").update(bytes).digest("hex") !== file.hash) {
      throw new PolicyError(
        "staged_content_changed",
        "Git-фильтр или параллельная правка изменили проверенное содержимое.",
      );
    }
    validateContent?.(bytes);
  }
}
