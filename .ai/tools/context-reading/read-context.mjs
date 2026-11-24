/**
 * @file .ai/tools/context-reading/read-context.mjs
 * @version 1.1.0
 * @date 2026-11-19
 * @description Возвращает ограниченный пакет строк или разделов UTF-8 и точные диапазоны продолжения без записи файлов.
 */
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const MAX_BYTES = 12288;
const fail = (code) => {
  throw new Error(code);
};
const encode = (sources, pending) =>
  JSON.stringify({ sources, pending }) + "\n";
const bytes = (text) => Buffer.byteLength(text, "utf8");

/** Находит ATX-заголовки вне fenced code; Markdown-дерево не строится. */
function headings(lines) {
  const found = [];
  let fence;
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index].replace(/\r?\n$/u, "");
    if (index === 0) line = line.replace(/^\uFEFF/u, "");
    if (fence) {
      const close = /^ {0,3}(`+|~+)[ \t]*$/u.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length)
        fence = undefined;
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (open && (open[1][0] !== "`" || !open[2].includes("`"))) {
      fence = open[1];
      continue;
    }
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+|$)/u.exec(line);
    if (heading)
      found.push({
        text: line.trim(),
        level: heading[1].length,
        line: index + 1,
      });
  }
  return found;
}

/** Разрешает единственный точный заголовок в обычный числовой диапазон. */
function bounds(item, lines) {
  if (Object.hasOwn(item, "startLine")) {
    const { startLine, endLine } = item;
    if (
      !Number.isSafeInteger(startLine) ||
      startLine < 1 ||
      (endLine !== null &&
        (!Number.isSafeInteger(endLine) || endLine < startLine))
    )
      fail("INVALID_INPUT");
    return [
      startLine,
      endLine === null ? lines.length : Math.min(endLine, lines.length),
    ];
  }
  const title = item.section ?? item.beforeHeading;
  if (
    typeof title !== "string" ||
    title !== title.trim() ||
    !/^#{1,6}(?:[ \t]+|$)/u.test(title)
  )
    fail("INVALID_INPUT");
  const all = headings(lines),
    matching = all.filter((heading) => heading.text === title);
  if (matching.length !== 1) fail("INVALID_INPUT");
  const target = matching[0];
  if (Object.hasOwn(item, "beforeHeading")) return [1, target.line - 1];
  const next = all.find(
    (heading) => heading.line > target.line && heading.level <= target.level,
  );
  return [target.line, next ? next.line - 1 : lines.length];
}

/** Валидирует весь ввод до вывода; возвращает только непустой пакет в бюджете. */
function packet(args) {
  let budget = MAX_BYTES;
  const option = args.indexOf("--max-bytes");
  if (option !== -1) {
    if (!/^\d+$/.test(args[option + 1] ?? "")) fail("INVALID_INPUT");
    budget = Number(args[option + 1]);
    args.splice(option, 2);
  }
  if (
    args.length !== 1 ||
    !Number.isSafeInteger(budget) ||
    budget < 1 ||
    budget > MAX_BYTES
  )
    fail("INVALID_INPUT");
  let selections;
  try {
    selections = JSON.parse(args[0]);
  } catch {
    fail("INVALID_INPUT");
  }
  if (
    !Array.isArray(selections) ||
    selections.length < 1 ||
    selections.length > 3
  )
    fail("INVALID_INPUT");
  const root = realpathSync(process.cwd()),
    cache = new Map(),
    files = new Map(),
    seen = new Map();
  let pending = selections.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      ![
        "endLine|path|startLine",
        "path|section",
        "beforeHeading|path",
      ].includes(Object.keys(item).sort().join("|"))
    )
      fail("INVALID_INPUT");
    const { path } = item;
    if (
      typeof path !== "string" ||
      !path ||
      path.includes("\0") ||
      isAbsolute(path) ||
      path.split("/").includes("..")
    )
      fail("INVALID_INPUT");
    let file, lines;
    try {
      file = realpathSync(resolve(root, path));
      const within = relative(root, file);
      if (
        isAbsolute(within) ||
        within === ".." ||
        within.startsWith(".." + sep) ||
        !statSync(file).isFile()
      )
        fail("INVALID_INPUT");
      if (!cache.has(file)) {
        const text = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(readFileSync(file));
        // LF задаёт координаты; CRLF, BOM и отсутствие финального LF сохраняются.
        cache.set(file, text.match(/[^\n]*\n|[^\n]+$/gu) ?? []);
      }
      lines = cache.get(file);
    } catch (error) {
      fail(error.message === "INVALID_INPUT" ? "INVALID_INPUT" : "READ_FAILED");
    }
    const [startLine, end] = bounds(item, lines);
    if (startLine > lines.length || end < startLine) fail("INVALID_INPUT");
    const prior = seen.get(file) ?? [];
    if (prior.some(([a, b]) => startLine <= b && a <= end))
      fail("INVALID_INPUT");
    seen.set(file, [...prior, [startLine, end]]);
    files.set(path, lines);
    return { path, startLine, endLine: end };
  });
  const sources = [];
  while (pending.length && sources.length < 3) {
    const q = pending[0];
    const candidate = (endLine) => {
      const row = {
        ...q,
        endLine,
        text: files
          .get(q.path)
          .slice(q.startLine - 1, endLine)
          .join(""),
      };
      const rest = [
        ...(endLine < q.endLine ? [{ ...q, startLine: endLine + 1 }] : []),
        ...pending.slice(1),
      ];
      return { row, rest, output: encode([...sources, row], rest) };
    };
    // В конце исчезает pending-дескриптор: проверяем полный фрагмент отдельно.
    const full = candidate(q.endLine);
    let best = bytes(full.output) <= budget ? full : null;
    if (!best) {
      let lo = q.startLine,
        hi = q.endLine - 1;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2),
          attempt = candidate(mid);
        if (bytes(attempt.output) <= budget) {
          best = attempt;
          lo = mid + 1;
        } else hi = mid - 1;
      }
    }
    if (!best) {
      if (sources.length) break;
      fail("LINE_TOO_LARGE");
    }
    sources.push(best.row);
    pending = best.rest;
  }
  const output = encode(sources, pending);
  if (!sources.length || bytes(output) > budget) fail("INVALID_INPUT");
  return output;
}

try {
  process.stdout.write(packet(process.argv.slice(2)));
} catch (error) {
  // Ошибки ОС/декодера не выводятся: они могут содержать данные источника.
  const code = ["INVALID_INPUT", "READ_FAILED", "LINE_TOO_LARGE"].includes(
    error.message,
  )
    ? error.message
    : "READ_FAILED";
  process.stderr.write(`read-context: ${code}\n`);
  process.exitCode = code === "LINE_TOO_LARGE" ? 3 : 2;
}
