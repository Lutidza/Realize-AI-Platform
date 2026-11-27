/**
 * @file .ai/tools/worker-assignment/src/discoverAssignmentSources.service.ts
 * @version 1.1.0
 * @date 2026-11-26
 * @description Подбирает источники тематического поручения штатным CLI agent-search.
 * @see documentation/architecture/repository-search.md
 */
import { escapeSearchTerm } from "./auditSearchScope.service";
import { searchAssignmentPartitions } from "./searchAssignmentPartitions.service";

/** Выдача ограничена; признаки и области сохраняются в проверках назначения. */
export async function discoverAssignmentSources(
  root: string,
  mission: string,
  signal: AbortSignal,
  allowEmpty = false,
  profiles?: { mode: string; flags: string[] }[],
) {
  const subject = mission.split(
    /(?:^|\n)\s*(?:ожидаемый результат|результат|ограничения|expected (?:output|result)|constraints)\s*:/iu,
  )[0];
  const quoted = [...subject.matchAll(/[«"`]([^»"`\n]{2,100})[»"`]/gu)].map(
    (match) => match[1],
  );
  const identifiers = subject.match(/[\p{L}\d]+(?:[-_][\p{L}\d]+)+/gu) ?? [];
  const terms = [...new Set([...quoted, ...identifiers])];
  if (!terms.length && !allowEmpty)
    throw new Error("assignment_search_terms_required");
  const modes = [];
  if (/весь проект|код|тест|документаци/iu.test(mission))
    modes.push("code-docs");
  if (mission.includes(".ai/")) modes.push("ai");
  if (mission.includes(".codex/")) modes.push("codex");
  if (!modes.length) modes.push("code-docs");
  const queries = terms.map(escapeSearchTerm);
  const paths = new Set<string>();
  const coverage: string[] = [];
  const evidence: Record<string, string[]> = Object.create(null);
  async function search(
    mode: string,
    expressions: string[],
    stage: string,
    flags: string[],
  ) {
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
      flags,
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
  if (queries.length)
    for (const profile of profiles ??
      modes.map((mode) => ({ mode, flags: [] })))
      await search(profile.mode, queries, "признаки", profile.flags);
  if (!paths.size && !allowEmpty)
    throw new Error("assignment_search_no_matches");
  return {
    paths: [...paths],
    terms,
    evidence,
    coverage:
      "Поиск agent-search: " +
      coverage.join(", ") +
      ". Признаки: " +
      terms.join(", ") +
      ". Указать пределы охвата; совпадение требует проверки.",
  };
}
