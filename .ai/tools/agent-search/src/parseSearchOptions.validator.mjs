/**
 * @file .ai/tools/agent-search/src/parseSearchOptions.validator.mjs
 * @version 1.4.0
 * @date 2026-09-28
 * @description Проверяет аргументы CLI и формирует ограниченные параметры поиска.
 */
import { searchProfiles, SEARCH_LIMITS } from "./searchProfiles.config.mjs";

const repeatable = new Set(["path", "within", "ext", "glob"]);
const booleans = new Set([
  "help",
  "fixed",
  "regex",
  "ignoreCase",
  "dry-run",
  "resolve-imports",
]);
const scalar = new Set([
  "mode",
  "output",
  "intent",
  "limit",
  "max-bytes",
  "timeout-ms",
  "reason",
  "metrics-file",
  "from",
  "max-depth",
]);
const aliases = {
  "-h": "--help",
  "-i": "--ignoreCase",
  "-F": "--fixed",
  "--ignore-case": "--ignoreCase",
};

export function parseSearchOptions(argv) {
  const options = {};
  const queryParts = [];
  let positionalOnly = false;
  for (const original of argv) {
    if (/[\u0000-\u001f\u007f]/u.test(original))
      throw new Error("Управляющие символы в аргументах запрещены.");
    if (original === "--" && !positionalOnly) {
      positionalOnly = true;
      continue;
    }
    const token = positionalOnly ? original : (aliases[original] ?? original);
    if (positionalOnly || !token.startsWith("-")) {
      queryParts.push(token);
      continue;
    }
    if (!token.startsWith("--"))
      throw new Error(
        `Неизвестный флаг ${token}; перед запросом с дефисом используйте --.`,
      );
    const separator = token.indexOf("=");
    const name = token.slice(2, separator < 0 ? undefined : separator);
    const value = separator < 0 ? undefined : token.slice(separator + 1);
    if (!repeatable.has(name) && !booleans.has(name) && !scalar.has(name))
      throw new Error(`Неизвестный параметр --${name}.`);
    if (!repeatable.has(name) && Object.hasOwn(options, name))
      throw new Error(`Параметр --${name} задан повторно.`);
    if (booleans.has(name)) {
      if (value !== undefined && value !== "true" && value !== "false")
        throw new Error(`--${name} принимает true или false.`);
      options[name] = value !== "false";
    } else {
      if (!value?.trim())
        throw new Error(`Нужно непустое значение --${name}=...`);
      if (repeatable.has(name)) (options[name] ??= []).push(value);
      else options[name] = value;
    }
  }
  if (options.help) return { help: true };
  const mode = options.mode ?? "code";
  if (!Object.hasOwn(searchProfiles, mode))
    throw new Error(`Неизвестный профиль ${mode}. См. --help.`);
  const profile = searchProfiles[mode];
  const output = options.output ?? "matches";
  const intent = options.intent ?? "text";
  const resolveImports = options["resolve-imports"] ?? false;
  if (
    resolveImports
      ? intent !== "imports" || output !== "matches" || !options.from
      : options.from !== undefined || options["max-depth"] !== undefined
  )
    throw new Error(
      "--resolve-imports требует --intent=imports, --from=TS/JS-файл и output=matches; --max-depth относится только к этому режиму.",
    );
  if (
    options.from &&
    (options.from.startsWith("/") ||
      /[\\:]/u.test(options.from) ||
      options.from
        .split("/")
        .some((part) => !part || part === "." || part === ".."))
  )
    throw new Error("--from требует канонический относительный POSIX путь.");
  if (!["text", "definitions", "references", "imports"].includes(intent))
    throw new Error("--intent: text, definitions, references или imports.");
  if (
    intent !== "text" &&
    (output === "paths" || options.regex === true || options.fixed === false)
  )
    throw new Error(
      "Синтаксическая навигация использует literal имена, output=matches|files и не принимает regexp.",
    );
  if (!["matches", "files", "paths"].includes(output))
    throw new Error("--output: matches, files или paths.");
  const query = queryParts.join(" ");
  if (!query.trim() && output !== "paths")
    throw new Error(
      "Укажите непустой запрос; для списка путей используйте --output=paths.",
    );
  if (
    (profile.reasonRequired || options.path?.length) &&
    !options.reason?.trim()
  )
    throw new Error("Для выбранной области нужен --reason=...");
  if (profile.explicit && !options.path?.length)
    throw new Error("Для reference/special нужен конкретный --path=...");
  if (options.regex !== undefined && options.fixed !== undefined)
    throw new Error("Выберите один параметр: --regex либо --fixed.");
  if (
    output === "paths" &&
    (options.regex !== undefined || options.fixed !== undefined)
  )
    throw new Error(
      "В режиме paths запрос является glob путей; --regex/--fixed неприменимы.",
    );
  const extensions = [
    ...new Set(
      (options.ext ?? [])
        .flatMap((value) => value.split(","))
        .map((value) => value.replace(/^\./u, "")),
    ),
  ];
  if (extensions.some((value) => !/^[A-Za-z0-9_+-]+$/u.test(value)))
    throw new Error("Некорректное расширение --ext.");
  if (
    profile.extensions &&
    extensions.some((value) => !profile.extensions.includes(value))
  )
    throw new Error(
      "Профиль docs допускает только Markdown; используйте --ext=md.",
    );
  return {
    help: false,
    mode,
    profile,
    output,
    intent,
    resolveImports,
    from: options.from,
    maxDepth: integer(
      options["max-depth"],
      { default: 8, max: 12 },
      "max-depth",
    ),
    query: query || "*",
    paths: options.path ?? [],
    within: options.within ?? [],
    reason: options.reason,
    globs: options.glob ?? [],
    extensions: extensions.length ? extensions : (profile.extensions ?? []),
    fixed:
      options.regex !== undefined ? !options.regex : (options.fixed ?? true),
    ignoreCase: options.ignoreCase ?? false,
    dryRun: options["dry-run"] ?? false,
    metricsFile: options["metrics-file"],
    limit: integer(options.limit, SEARCH_LIMITS.results, "limit"),
    maxBytes: integer(options["max-bytes"], SEARCH_LIMITS.bytes, "max-bytes"),
    timeoutMs: integer(
      options["timeout-ms"],
      SEARCH_LIMITS.timeoutMs,
      "timeout-ms",
    ),
  };
}

function integer(value, limits, name) {
  if (value === undefined) return limits.default;
  const number = Number(value);
  if (
    !/^\d+$/u.test(value) ||
    !Number.isSafeInteger(number) ||
    number < (limits.min ?? 1) ||
    number > limits.max
  ) {
    throw new Error(
      `--${name}: целое число от ${limits.min ?? 1} до ${limits.max}.`,
    );
  }
  return number;
}
