/**
 * @file .ai/tools/worker-assignment/src/discoverAssignmentSources.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Подбирает источники тематического поручения штатным CLI agent-search.
 * @see documentation/architecture/repository-search.md
 */
import { basename, extname } from "node:path";
import { searchAssignmentPartitions } from "./searchAssignmentPartitions.service";

/** Выдача ограничена; признаки и области сохраняются в проверках назначения. */
export async function discoverAssignmentSources(
  root: string,
  mission: string,
  signal: AbortSignal,
) {
  const subject = mission.split(
    /(?:^|\n)\s*(?:ожидаемый результат|результат|ограничения|expected (?:output|result)|constraints)\s*:/iu,
  )[0];
  const quoted = [...subject.matchAll(/[«"`]([^»"`\n]{2,100})[»"`]/gu)].map(
    (match) => match[1],
  );
  const identifiers = subject.match(/[\p{L}\d]+(?:[-_][\p{L}\d]+)+/gu) ?? [];
  const terms = [...new Set([...quoted, ...identifiers])];
  if (!terms.length) throw new Error("assignment_search_terms_required");
  const modes = [];
  if (/весь проект|код|тест|документаци/iu.test(mission))
    modes.push("code-docs");
  if (mission.includes(".ai/")) modes.push("ai");
  if (mission.includes(".codex/")) modes.push("codex");
  if (!modes.length) modes.push("code-docs");
  const queries = terms
    .slice(0, 8)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const paths = new Set<string>();
  const coverage: string[] = [];
  const evidence: Record<string, string[]> = Object.create(null);
  async function search(mode: string, expressions: string[], stage: string) {
    const result = await searchAssignmentPartitions(
      root,
      mode,
      expressions.join("|"),
      signal,
      (path, line) => {
        paths.add(path);
        const entry = stage + " " + line.slice(0, 280);
        const entries = (evidence[path] ??= []);
        if (entries.length < 5 && !entries.includes(entry)) entries.push(entry);
      },
    );
    for (const path of result.files) paths.add(path);
    coverage.push(
      stage +
        "/" +
        mode +
        ": файлов " +
        result.files.size +
        ", запросов " +
        result.calls +
        ", разбиений " +
        result.splits +
        ", файлов с ограничением строк CLI " +
        result.denseFiles.size +
        (result.warnings.size
          ? ", предупреждения: " + [...result.warnings].join("; ")
          : ""),
    );
  }
  for (const mode of modes) await search(mode, queries, "признаки");
  const broad =
    /весь проект|всего проекта|полный аудит|whole repository|full audit/iu.test(
      mission,
    );
  if (broad) {
    const expressions = [
      ...new Set(
        [...paths].sort().map((path) => {
          const escape = (value: string) =>
            value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          if (!/\.[cm]?[jt]sx?$/.test(path)) return escape(path);
          const name = basename(path, extname(path));
          // Короткое имя модуля (например, index) имеет смысл только как часть ссылки.
          return "(?:/|[\"'`])" + escape(name) + "(?:\\.[cm]?[jt]sx?)?[\"'`)]";
        }),
      ),
    ];
    if (expressions.length)
      for (const mode of modes) await search(mode, expressions, "ссылки");
  }
  if (!paths.size) throw new Error("assignment_search_no_matches");
  return {
    paths: [...paths],
    evidence,
    coverage:
      "Поиск agent-search: " +
      coverage.join(", ") +
      ". Признаки: " +
      terms.slice(0, 8).join(", ") +
      ". Указать пределы охвата; совпадение требует проверки.",
  };
}
