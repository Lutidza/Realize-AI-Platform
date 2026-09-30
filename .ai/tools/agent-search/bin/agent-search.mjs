#!/usr/bin/env node
/**
 * @file .ai/tools/agent-search/bin/agent-search.mjs
 * @version 1.5.0
 * @date 2026-09-28
 * @description Запускает ограниченный поиск по выбранной области репозитория.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSearchOptions } from "../src/parseSearchOptions.validator.mjs";
import { resolveSearchScope } from "../src/resolveSearchScope.adapter.mjs";
import { buildRipgrepArgs } from "../src/buildRipgrepArgs.util.mjs";
import { runRipgrepSearch } from "../src/runRipgrepSearch.adapter.mjs";
import { buildSearchObservation } from "../src/buildSearchObservation.mapper.mjs";
import { enqueueSearchObservation } from "../src/searchObservationSpool.adapter.mjs";
import { writeSearchObservation } from "../src/writeSearchObservation.adapter.mjs";
import {
  searchProfiles,
  SEARCH_LIMITS,
} from "../src/searchProfiles.config.mjs";

async function main() {
  const options = parseSearchOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../..",
  );
  const scope = resolveSearchScope(root, options);
  if (scope.missing.length)
    process.stderr.write(
      `Пропущены отсутствующие пути профиля: ${scope.missing.join(", ")}\n`,
    );
  if (options.dryRun) {
    console.log(
      `mode=${options.mode} intent=${options.intent} output=${options.output} limit=${options.limit} max-bytes=${options.maxBytes} timeout-ms=${options.timeoutMs}`,
    );
    console.log(`paths: ${scope.paths.join(", ")}`);
    console.log(`candidate-roots: ${scope.discoveryPaths.join(", ")}`);
    console.log(`query: ${shellQuote(options.query)}`);
    if (options.resolveImports) {
      console.log(
        `resolve-imports: from=${shellQuote(options.from)} max-depth=${options.maxDepth}; bounded profile inventory и адресные чтения зависимостей.`,
      );
      return;
    }
    console.log(
      `rg ${buildRipgrepArgs(
        { ...options, output: "paths" },
        { ...scope, paths: scope.discoveryPaths },
      )
        .map(shellQuote)
        .join(" ")}`,
    );
    console.log(
      "Команда перечисляет кандидатов; CLI фильтрует их и ищет содержимое пакетами с общим бюджетом.",
    );
    return;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const observedAt = new Date().toISOString();
    const result = await runRipgrepSearch(options, scope, {
      signal: controller.signal,
    });
    if (result.records.length) console.log(result.records.join("\n"));
    if (["limit", "bytes"].includes(result.stopped))
      console.log(
        `# Выдача неполная: лимит ${result.stopped === "limit" ? "результатов" : "байтов"}; поиск остановлен. Сузьте запрос/область.`,
      );
    else if (result.stopped === "scan_budget")
      console.log(
        "# Выдача неполная: бюджет обхода imports. Сузьте профиль/запрос; повтор того же запроса не продолжает обход.",
      );
    else if (!result.records.length && !result.failure)
      console.log("Совпадений нет.");
    if (result.failure) process.stderr.write(`${result.failure}\n`);
    if (result.navigation && !result.resolution) {
      const coverage = result.navigation;
      console.log(
        `# syntax TS/JS: parsed=${coverage.parsedFiles} prefiltered=${coverage.prefilteredFiles} unsupported=${coverage.unsupportedFiles} skipped=${coverage.skippedFiles} syntax-errors=${coverage.syntaxErrorFiles}`,
      );
    }
    if (result.resolution)
      console.log(
        `# imports: depth=${result.resolution.maxDepth} parsed=${result.navigation.parsedFiles} unsupported=${result.navigation.unsupportedFiles} skipped=${result.navigation.skippedFiles} syntax-errors=${result.navigation.syntaxErrorFiles} files=${result.resolution.filesRead} bytes=${result.resolution.bytesRead} unresolved=${result.resolution.unresolvedMatches}`,
      );
    process.exitCode = result.exitCode;
    const observation = buildSearchObservation(options, result, observedAt);
    enqueueSearchObservation(root, observation);
    if (options.metricsFile) {
      try {
        await writeSearchObservation(
          root,
          options,
          result,
          observedAt,
          observation,
        );
      } catch {
        process.stderr.write(
          "Диагностика не сохранена: нужен новый JSON-файл в существующем logs каталоге задачи; результат поиска сохранён.\n",
        );
      }
    }
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function printHelp() {
  console.log(`agent-search [--mode=code] [параметры] [--] запрос

Литеральный поиск по умолчанию. --regex включает регулярное выражение rg.
--intent=text|definitions|references|imports
                  TS/JS navigation: точное имя; imports также literal часть module specifier.
                  imports с запросом * перечисляет module specifiers выбранного файла.
                  references — синтаксические употребления, без связывания символов.
--resolve-imports --from=путь --max-depth=8
                  Только intent=imports/output=matches: переходы к разрешённым файлам и exports.
                  --from выбирает старт; профиль/within/glob ограничивают зависимые исходники.
--output=matches   path:line:byte-column:фрагмент совпадения
--output=files     Только файлы с совпадениями
--output=paths     Пути по glob, без чтения содержимого; запрос по умолчанию *
--limit=${SEARCH_LIMITS.results.default} --max-bytes=${SEARCH_LIMITS.bytes.default} --timeout-ms=${SEARCH_LIMITS.timeoutMs.default}
--path=путь --reason=причина   Расширение профиля; special/reference выбирают только эти пути
--within=путь                Сужение выбранной области; повторяемый, сохраняет исключения
--ext=ts,tsx --glob=шаблон    Пересекающиеся фильтры; исключение начинается с !
--ignoreCase=true | -i       Без учёта регистра
--fixed=true|false           Литеральный поиск или regexp
--dry-run=true               Область и аргументы rg без запуска
--metrics-file=/.../.ai-workspace/tasks/<task>/logs/<name>.json
                             Дополнительный экспорт обезличенной диагностики; новый файл

Метрики автоматически попадают в локальный буфер; control plane доставляет их в Admin.

Профили:
${Object.entries(searchProfiles)
  .map(([name, profile]) => `  ${name.padEnd(12)} ${profile.description}`)
  .join("\n")}

Коды: 0 — результаты/явно ограниченная выдача; 1 — совпадений нет; 2 — ошибка; 130 — отмена.`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`Ошибка: ${error.message}\n`);
  process.exitCode = 2;
}
