/** Проверяет весь индекс и фактические staged-объекты перед созданием commit. */
import { createHash } from "node:crypto";
import { PolicyError } from "./contracts.ts";
import { Git } from "./git.ts";
import { stagedPaths } from "./repository.ts";
import type { Snapshot } from "./repository.ts";

export function validateChanges(snapshot: Snapshot): string[] {
  const paths = snapshot.changes.map((change) => change.path);
  if (paths.length > 2048)
    throw new PolicyError("scope_limit", "Состав превышает 2048 файлов.");
  if (new Set(paths).size !== paths.length) {
    throw new PolicyError(
      "partial_index",
      "Один путь одновременно удалён из индекса и создан заново; требуется отдельное решение.",
    );
  }
  for (const { path, status } of snapshot.changes) {
    if (status.includes("U") || ["AA", "DD"].includes(status)) {
      throw new PolicyError(
        "unmerged_index",
        "Сначала требуется разрешить конфликт индекса.",
      );
    }
    if (status !== "??" && status[0] !== " " && status[1] !== " ") {
      throw new PolicyError(
        "partial_index",
        "Частично подготовленный файл требует отдельного решения.",
      );
    }
    if (
      /(^|\/)(?:node_modules|\.next|dist|coverage)(\/|$)/i.test(path) ||
      /^\.ai-workspace\/tasks\//.test(path) ||
      /^\.ai\/tools\/agent-runtime\/runtime\/(?!INDEX\.md$|schemas\/)/.test(
        path,
      ) ||
      (/(^|\/)\.env(?:\.|$)/i.test(path) &&
        !/(^|\/)\.env\.example$/.test(path)) ||
      /(^|\/)(?:id_rsa|id_ed25519|credentials\.json)$|\.(?:pem|p12|pfx|key)$/i.test(
        path,
      )
    ) {
      throw new PolicyError(
        "protected_path",
        "В состав попал секрет или локальный артефакт; уточните область.",
      );
    }
  }
  return paths;
}

export async function assertIndexScope(
  git: Git,
  paths: string[],
  exact = false,
): Promise<void> {
  const staged = await stagedPaths(git);
  const allowed = new Set(paths);
  if (
    staged.some((path) => !allowed.has(path)) ||
    (exact && staged.length !== paths.length)
  ) {
    throw new PolicyError(
      "foreign_index",
      "Индекс содержит другой состав; чужие изменения сохранены.",
    );
  }
}

export async function verifyStaged(
  git: Git,
  snapshot: Snapshot,
  paths: string[],
): Promise<void> {
  await assertIndexScope(git, paths, true);
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
    // Это дополнительный детектор явных секретов, а не доказательство их отсутствия.
    const content = bytes.toString("utf8");
    if (
      /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16})\b/.test(
        content,
      ) ||
      /https?:\/\/[^\s/@:]+:[^\s/@]+@/i.test(content)
    ) {
      throw new PolicyError(
        "secret_detected",
        "В staged-содержимом обнаружен возможный секрет; требуется проверка.",
      );
    }
  }
}
