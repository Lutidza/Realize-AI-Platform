/**
 * @file .ai/tools/agent-search/src/resolveSearchScope.adapter.mjs
 * @version 1.1.1
 * @date 2026-09-26
 * @description Проверяет реальные пути поиска и исключает выход за область репозитория.
 */
import { realpathSync, statSync } from "node:fs";
import path from "node:path";
import { searchExclusions } from "./searchProfiles.config.mjs";
import { matchesExcludedPath } from "./matchesSearchGlob.util.mjs";

export function resolveSearchScope(repositoryRoot, options) {
  const root = realpathSync(repositoryRoot);
  const excluded = [...searchExclusions.always];
  if (!options.profile.explicit) {
    excluded.push(...searchExclusions.ordinary);
    if (!options.profile.legacy) excluded.push(...searchExclusions.quarantine);
  }
  const missing = [];
  const entries = [];
  const requested = options.profile.explicit ? [] : options.profile.paths;
  for (const [value, explicit] of [
    ...requested.map((value) => [value, false]),
    ...options.paths.map((value) => [value, true]),
  ]) {
    const entry = readEntry(value, { optional: !explicit });
    if (!entry) continue;
    if (isLock(entry) && (!explicit || !options.reason))
      throw new Error("Lock-файл требует точного --path и --reason.");
    entries.push(entry);
  }
  if (!entries.length)
    throw new Error(`Нет доступных путей профиля ${options.mode}.`);
  const narrowed = options.within.map((value) => {
    const entry = readEntry(value, { parameter: "--within" });
    if (!entries.some((parent) => contains(parent, entry)))
      throw new Error(
        `--within выходит за выбранную область ${options.mode}: ${entry.path}`,
      );
    // Сужение не выдаёт новое разрешение на lock-файл внутри каталога.
    if (isLock(entry) && !entries.some((parent) => parent.path === entry.path))
      throw new Error(
        "Lock-файл требует точного --path и --reason; --within не заменяет их.",
      );
    return entry;
  });
  const selected = narrowed.length ? narrowed : entries;
  const paths = distinctPaths(selected);
  // Перечисление начинается в исходных корнях: within не меняет ignore-контекст.
  // Корни без пересечения с сужением не обходятся даже при перечислении имён.
  const discoveryPaths = distinctPaths(
    entries.filter((entry) =>
      selected.some(
        (target) => contains(entry, target) || contains(target, entry),
      ),
    ),
  );
  return {
    root,
    paths,
    discoveryPaths,
    missing,
    excluded: [...excluded, ...searchExclusions.locks],
  };

  function distinctPaths(candidates) {
    return [...new Map(candidates.map((entry) => [entry.path, entry])).values()]
      .filter(
        (entry) =>
          !candidates.some(
            (parent) =>
              parent.path !== entry.path &&
              contains(parent, entry) &&
              !isLock(entry),
          ),
      )
      .map((entry) => entry.path);
  }

  // --path и --within проходят одну проверку реального пути и исключений профиля.
  function readEntry(value, { optional = false, parameter = "--path" } = {}) {
    if (
      path.isAbsolute(value) ||
      path.win32.isAbsolute(value) ||
      value.includes("\\") ||
      value.split("/").includes("..")
    ) {
      throw new Error(
        `${parameter} должен быть относительным POSIX путём без ..`,
      );
    }
    const lexical = path.posix.normalize(value).replace(/\/$/u, "");
    if (lexical === "." || !lexical)
      throw new Error("Укажите конкретный путь, а не корень репозитория.");
    if (matchesExcludedPath(lexical, excluded))
      throw new Error(`Путь исключён выбранным профилем: ${lexical}`);
    let resolved;
    let stat;
    try {
      resolved = realpathSync(path.join(root, lexical));
      stat = statSync(resolved);
    } catch (error) {
      if (optional && error.code === "ENOENT") {
        missing.push(lexical);
        return undefined;
      }
      if (error.code === "ENOENT")
        throw new Error(`Путь не существует: ${lexical}`);
      throw new Error(
        `Не удалось прочитать путь ${lexical}: ${error.code ?? "ошибка filesystem"}`,
      );
    }
    const relative = path.relative(root, resolved).split(path.sep).join("/");
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith("../") ||
      path.isAbsolute(relative)
    )
      throw new Error(
        "Путь или symlink выходит за разрешённую область репозитория.",
      );
    if (matchesExcludedPath(relative, excluded))
      throw new Error(`Цель пути исключена выбранным профилем: ${relative}`);
    if ([".ai-workspace", ".ai-workspace/tasks"].includes(relative))
      throw new Error("Для рабочей области укажите путь конкретной задачи.");
    if (!stat.isFile() && !stat.isDirectory())
      throw new Error(`Нужен обычный файл или каталог: ${relative}`);
    if (stat.isFile()) {
      if (
        options.extensions.length &&
        !options.extensions.some((ext) => relative.endsWith(`.${ext}`))
      )
        throw new Error(
          `Файл не соответствует расширениям поиска: ${relative}`,
        );
    }
    return { path: relative, isDirectory: stat.isDirectory() };
  }
}

function contains(parent, entry) {
  return (
    parent.path === entry.path ||
    (parent.isDirectory && entry.path.startsWith(`${parent.path}/`))
  );
}

function isLock(entry) {
  return (
    !entry.isDirectory &&
    matchesExcludedPath(entry.path, searchExclusions.locks)
  );
}
