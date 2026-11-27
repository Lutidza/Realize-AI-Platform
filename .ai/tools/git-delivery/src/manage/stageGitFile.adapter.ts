/**
 * @file .ai/tools/git-delivery/src/manage/stageGitFile.adapter.ts
 * @version 1.0.0
 * @date 2026-11-27
 * @description Закрепляет байты одного файла и проверяет остальные записи индекса до и после локального stage.
 * @see .ai/tools/git-delivery/README.md
 */
import { createHash } from "node:crypto";
import { Git, PolicyError } from "@realize/git-runtime";
import { assertNoGitSecrets } from "../commit/assertNoGitSecrets.validator.ts";
import type { StageFile } from "./GitManage.types.ts";
import { readGitWorkingContent } from "./readGitWorkingContent.adapter.ts";

async function stageSource(
  git: Git,
  op: StageFile,
  write: boolean,
  current: string,
) {
  const source = await readGitWorkingContent(git.root, op.path);
  if (
    !source ||
    createHash("sha256").update(source.bytes).digest("hex") !== op.sha256
  )
    throw new PolicyError(
      "stage_source_changed",
      "Файл отсутствует или его содержимое изменилось.",
    );
  assertNoGitSecrets(source.bytes);
  const attrs = await git.run(["check-attr", "-z", "filter", "--", op.path]);
  if (!["unset", "unspecified"].includes(attrs.split("\0")[2]))
    throw new PolicyError(
      "stage_external_filter",
      "Файл требует внешнего Git-фильтра.",
    );
  const blob = (
    await git.run(
      ["hash-object", ...(write ? ["-w"] : []), "--path=" + op.path, "--stdin"],
      { input: source.bytes },
    )
  ).trim();
  if (!/^[a-f0-9]{40}$/.test(blob))
    throw new PolicyError(
      "stage_blob_invalid",
      "Не удалось определить OID файла.",
    );
  const trust = (
    await git.run(["config", "--bool", "--get", "core.filemode"], {
      acceptedExitCodes: [0, 1],
    })
  ).trim();
  const mode =
    trust === "false" ? current.split(" ")[0] || "100644" : source.mode;
  return mode + " " + blob;
}

/** Хеширует все остальные entries вместе с flags, путями и стадиями, включая ранее staged файлы. */
async function stageIndex(git: Git, op: StageFile) {
  const entries = await git.run(["ls-files", "-v", "--stage", "-z"], {
    machineRead: true,
  });
  const others = createHash("sha256");
  let current = "";
  for (const entry of entries.split("\0")) {
    if (!entry) continue;
    const tab = entry.indexOf("\t"),
      path = entry.slice(tab + 1);
    if (path === op.path) {
      const m = /^H (100644|100755) ([a-f0-9]{40}) 0$/.exec(
        entry.slice(0, tab),
      );
      if (!m || current)
        throw new PolicyError(
          "stage_index_conflict",
          "Целевой файл имеет конфликт, флаг пропуска или неподдерживаемый тип.",
        );
      current = m[1] + " " + m[2];
    } else {
      if (path.startsWith(op.path + "/") || op.path.startsWith(path + "/"))
        throw new PolicyError(
          "stage_index_conflict",
          "Целевой путь пересекается с другой записью индекса.",
        );
      others.update(entry).update("\0");
    }
  }
  if (
    !current &&
    (await git.run(
      ["ls-files", "--others", "--exclude-standard", "-z", "--", op.path],
      { machineRead: true },
    )) !==
      op.path + "\0"
  )
    throw new PolicyError(
      "stage_file_unavailable",
      "Нужен конкретный доступный Git файл; ignored и вложенные репозитории исключены.",
    );
  return [current, others.digest("hex")];
}

export async function readStageFileState(git: Git, op: StageFile) {
  const [current, others] = await stageIndex(git, op);
  return [current, others, await stageSource(git, op, false, current)];
}

/** Передаёт update-index конкретный уже прочитанный blob. Git блокирует index и не получает pathspec или --replace. */
export async function writeStageFile(
  git: Git,
  op: StageFile,
  expected: string[],
) {
  const [current, others] = await stageIndex(git, op);
  const desired = await stageSource(git, op, true, current);
  if (expected[0] !== desired || expected[1] !== others)
    throw new PolicyError(
      "stage_index_changed",
      "Снимок изменился до обновления индекса.",
    );
  const [mode, oid] = desired.split(" ");
  await git.run([
    "-c",
    "core.hooksPath=/dev/null",
    "update-index",
    "--add",
    "--cacheinfo",
    mode + "," + oid + "," + op.path,
  ]);
}
