/**
 * @file .ai/tools/worker-assignment/src/auditSearchScope.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Инвентаризирует разрешённые пути штатным поиском и разрешает уточнения только внутри этого снимка.
 * @see documentation/architecture/repository-search.md
 */
import { execFile } from "node:child_process";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  isRepositoryPathAllowed,
  REPOSITORY_ROOT_FILES,
  REPOSITORY_ROOT_DIRECTORIES,
  type RepositoryReadPolicy,
} from "realize-ai-platform/repository-read-policy";
import {
  excludeFile,
  searchAssignmentPartitions,
} from "./searchAssignmentPartitions.service";

const run = promisify(execFile);
export const escapeSearchTerm = (term: string) =>
  term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function expansiveAudit(task: string) {
  return /(?:полны[йм]|всесторонн[а-я]+|сквозно[йм])\s+(?:аудит|обзор|анализ)|(?:весь|всего|всему)\s+(?:проект|репозитори)|(?:full|complete|comprehensive)\s+(?:repository\s+)?audit|(?:whole|entire)\s+repository|потребител|кто\s+использует|consumers?|callers?/iu.test(
    task,
  );
}

type Profile = { mode: string; flags: string[] };
export type AuditScope = {
  files: Map<string, string>;
  profiles: Profile[];
  excluded: number;
};
export const areaOf = (path: string) =>
  path.includes("/") ? path.split("/")[0] : "(root)";

/** При заполненной странице делит только увиденные ветви; --within сохраняет исходные исключения. */
async function listPaths(
  root: string,
  profile: Profile,
  signal: AbortSignal,
  add: (path: string) => void,
) {
  async function walk(prefix: string) {
    const excluded = new Set<string>();
    for (;;) {
      signal.throwIfAborted();
      let output: string;
      try {
        const page = await run(
          process.execPath,
          [
            ".ai/tools/agent-search/bin/agent-search.mjs",
            "--mode=" + profile.mode,
            "--output=paths",
            "--limit=500",
            "--max-bytes=65536",
            "--timeout-ms=60000",
            ...profile.flags,
            ...(prefix ? ["--within=" + prefix] : []),
            ...Array.from(excluded, excludeFile),
          ],
          { cwd: root, signal, timeout: 65000, maxBuffer: 131072 },
        );
        output = page.stdout;
      } catch (error) {
        signal.throwIfAborted();
        if ((error as { code?: number }).code === 1) return;
        throw new Error(
          "assignment_search_failed: инвентаризация " +
            profile.mode +
            " " +
            prefix,
        );
      }
      if (!output.trim())
        throw new Error(
          "assignment_search_failed: CLI вернул пустую успешную страницу " +
            profile.mode,
        );
      const lines = output.trimEnd().split("\n");
      const limited = lines.at(-1)?.startsWith("# Выдача неполная:");
      if (limited) lines.pop();
      if (lines.some((line) => line.startsWith("# ")))
        throw new Error(
          "assignment_search_failed: неожиданный ответ инвентаризации",
        );
      for (const path of lines.filter(Boolean)) add(path);
      if (!limited) return;
      const branches = new Map<string, boolean>();
      for (const path of lines) {
        const relative = prefix ? path.slice(prefix.length + 1) : path;
        const branch = (prefix ? prefix + "/" : "") + relative.split("/")[0];
        if (excluded.has(branch))
          throw new Error(
            "assignment_search_failed: повтор страницы " + branch,
          );
        branches.set(branch, path !== branch);
      }
      if (!branches.size)
        throw new Error("assignment_search_failed: пустая неполная страница");
      for (const [branch, directory] of branches) {
        if (directory) await walk(branch);
        excluded.add(branch);
      }
    }
  }
  const targets = profile.flags
    .filter((f) => f.startsWith("--path="))
    .map((f) => f.slice(7));
  for (const target of targets.length ? targets : [""]) await walk(target);
}

/** Корневые конфиги берутся из общей политики чтения, скрытые слои подключаются по области задачи. */
export async function inventoryAuditScope(
  policy: RepositoryReadPolicy,
  task: string,
  signal: AbortSignal,
): Promise<AuditScope> {
  const roots = new Set(await readdir(policy.root));
  const profiles: Profile[] = [{ mode: "code-docs", flags: [] }];
  for (const name of [".ai", ".codex"])
    if (
      task.includes(name) ||
      /(?:весь|всего)\s+(?:репозитор|проект)|(?:entire|whole)\s+repository|полный аудит репозитор|full repository audit/iu.test(
        task,
      )
    )
      profiles.push({ mode: name.slice(1), flags: [] });
  const files = new Map<string, string>();
  const excluded = new Set<string>(),
    coveredRoots = new Set<string>();
  async function enumerate(profile: Profile) {
    await listPaths(policy.root, profile, signal, (path) => {
      coveredRoots.add(path.split("/")[0]);
      if (isRepositoryPathAllowed(policy, path)) files.set(path, profile.mode);
      else excluded.add(path);
    });
  }
  for (const profile of profiles) await enumerate(profile);
  // Для вопроса о происхождении и наследии поиск адресно включает доступные исторические каталоги штатного профиля.
  const historical =
    /остатк|устаревш|разов|происхожден|историч|архив|заверш[её]н|наследи|quarantin|legacy|histor|archiv|obsolete|retired|deprecated|remnant/iu.test(
      task,
    );
  const config = new URL(
    "../../agent-search/src/searchProfiles.config.mjs",
    import.meta.url,
  );
  const {
    searchExclusions,
  }: { searchExclusions: { ordinary: string[]; quarantine: string[] } } =
    await import(config.href);
  const references: string[] = [];
  for (const glob of [
    ...searchExclusions.ordinary,
    ...searchExclusions.quarantine,
  ]) {
    if (!glob.endsWith("/**")) continue;
    const dir = glob.slice(0, -3);
    if (
      (!historical && !task.includes(dir)) ||
      !coveredRoots.has(areaOf(dir)) ||
      !isRepositoryPathAllowed(policy, dir)
    )
      continue;
    if (
      (
        await lstat(join(policy.root, dir)).catch(() => undefined)
      )?.isDirectory()
    )
      references.push(dir);
  }
  if (references.length) {
    const reference = {
      mode: "reference",
      flags: [
        "--reason=Проверка происхождения и связанных исторических материалов поручения",
        ...references.map((dir) => "--path=" + dir),
      ],
    };
    profiles.push(reference);
    await enumerate(reference);
  }
  const extra = [
    ...REPOSITORY_ROOT_FILES,
    ...REPOSITORY_ROOT_DIRECTORIES,
  ].filter(
    (p) =>
      roots.has(p) &&
      !coveredRoots.has(p) &&
      ![".ai", ".codex"].includes(p) &&
      (!p.endsWith("-lock.json") || task.includes(p)),
  );
  if (extra.length) {
    const additional = {
      mode: "special",
      flags: [
        "--reason=Проверка доступной конфигурации в заявленной области",
        ...extra.map((p) => "--path=" + p),
      ],
    };
    profiles.push(additional);
    await enumerate(additional);
  }
  return { files, profiles, excluded: excluded.size };
}

export type AuditLookup = {
  kind: "path" | "text" | "consumer" | "passage" | "definition";
  scope: string;
  value: string;
  source: string;
  line: number;
  question?: string;
  definition?: string;
};
export function lookupKey(request: AuditLookup) {
  if (request.kind === "passage")
    return JSON.stringify([
      request.kind,
      request.source,
      request.line,
      request.value.trim().toLowerCase().replace(/\s+/gu, " "),
    ]);
  return JSON.stringify([
    request.kind,
    request.scope,
    request.value,
    request.kind === "consumer" ? request.source : "",
  ]);
}

/** Область уточнения может быть уже корня профиля: конкретный каталог либо один файл. */
export function inAuditScope(path: string, scope: string) {
  return (
    scope === "*" ||
    (scope === "(root)"
      ? !path.includes("/")
      : path === scope || path.startsWith(scope + "/"))
  );
}

/** Большая доля совпадений описывает язык или каталог; журнал сохраняет выдачу для более точного запроса. */
export function broadLookupBranches(
  inventory: AuditScope,
  request: AuditLookup,
  paths: string[],
) {
  if (
    request.kind === "consumer" ||
    request.kind === "passage" ||
    paths.length < 48
  )
    return;
  const roots = new Set(paths.map(areaOf));
  const population = [...inventory.files.keys()].filter(
    (p) => inAuditScope(p, request.scope) && roots.has(areaOf(p)),
  ).length;
  if (paths.length * 4 < population) return;
  const groups = new Map<string, number>();
  for (const path of paths) {
    const parent = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : "(root)";
    groups.set(parent, (groups.get(parent) ?? 0) + 1);
  }
  return [...groups]
    .sort((a, b) => b[1] - a[1])
    .map(([scope, matches]) => ({ scope, matches }));
}

/** Литерал задаёт поиск по имени, содержимому или употреблению. Выдача всегда пересекается с инвентарём. */
export async function lookupAuditSources(
  root: string,
  inventory: AuditScope,
  lookup: AuditLookup,
  signal: AbortSignal,
) {
  const selected = (path: string) =>
    inventory.files.has(path) && inAuditScope(path, lookup.scope);
  const hits = new Map<string, string>();
  if (!lookup.value.trim())
    throw new Error("assignment_search_failed: пустой запрос");
  if (lookup.kind === "passage") {
    if (selected(lookup.source)) hits.set(lookup.source, lookup.source);
    return hits;
  }
  if (lookup.kind === "path") {
    const needle = lookup.value.toLowerCase();
    for (const path of inventory.files.keys())
      if (selected(path) && path.toLowerCase().includes(needle))
        hits.set(path, path);
    return hits;
  }
  for (const profile of inventory.profiles) {
    if (
      !Array.from(inventory.files).some(
        ([p, m]) => m === profile.mode && selected(p),
      )
    )
      continue;
    const flags = [...profile.flags];
    if (lookup.scope !== "*" && lookup.scope !== "(root)") {
      const roots = profile.flags
        .filter((f) => f.startsWith("--path="))
        .map((f) => f.slice(7));
      const subs = roots.filter((p) => inAuditScope(p, lookup.scope));
      for (const path of subs.length ? subs : [lookup.scope])
        flags.push("--within=" + path);
    }
    await searchAssignmentPartitions(
      root,
      profile.mode,
      lookup.kind === "definition"
        ? lookup.value
        : escapeSearchTerm(lookup.value),
      signal,
      (path, match) => {
        if (selected(path) && !hits.has(path)) hits.set(path, match);
      },
      flags,
      lookup.kind === "definition" ? "definitions" : "text",
    );
  }
  return hits;
}
