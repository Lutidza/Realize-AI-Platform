/**
 * @file .ai/tools/task-workspace/src/consumers/matchWorkspaceReferences.util.mjs
 * @version 1.0.1
 * @date 2026-10-15
 * @description Сопоставляет текстовые и документные ссылки на артефакты без файлового доступа.
 * @see documentation/specifications/task-management-execution.md
 */
import path from "node:path";

const LITERAL_BOUNDARY = /[\s"'`<>()[\]{},;:=!?]/u;

/**
 * Отличает путь от соседнего имени и от вхождения внутри чужого пути.
 * @param {string} text
 * @param {string} needle
 * @returns {boolean}
 */
function containsPathLiteral(text, needle) {
  let offset = 0;
  while (offset < text.length) {
    const index = text.indexOf(needle, offset);
    if (index === -1) return false;
    const before = text[index - 1];
    const after = text[index + needle.length];
    if (
      (!before || LITERAL_BOUNDARY.test(before)) &&
      (!after || after === "/" || after === "#" || LITERAL_BOUNDARY.test(after))
    )
      return true;
    offset = index + needle.length;
  }
  return false;
}

/**
 * Лексическое разрешение не открывает целевой документ и не следует ссылкам.
 * @param {string} root
 * @param {string} source
 * @param {string} destination
 * @returns {string | null}
 */
function referencedPath(root, source, destination) {
  let value = destination.trim();
  if (
    !value ||
    value.includes("\\") ||
    Array.from(value).some((character) => character.charCodeAt(0) < 0x20)
  )
    return null;
  if (value.startsWith("file:")) {
    try {
      const url = new URL(value);
      if (
        url.protocol !== "file:" ||
        (url.hostname && url.hostname !== "localhost")
      )
        return null;
      value = decodeURIComponent(url.pathname);
    } catch {
      return null;
    }
  } else {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//"))
      return null;
    value = value.split(/[?#]/, 1)[0];
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  if (!value) return null;
  let absolute;
  if (path.isAbsolute(value)) absolute = path.resolve(value);
  else if (value.startsWith(".ai-workspace/"))
    absolute = path.resolve(root, value);
  else absolute = path.resolve(root, path.dirname(source), value);
  const relative = path.relative(root, absolute);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  )
    return null;
  return relative;
}

/**
 * Markdown-ссылки, определения и пути в обратных кавычках распознаются в TASK.md.
 * @param {string} root
 * @param {string} source
 * @param {string} text
 * @param {string} target
 */
function documentReferences(root, source, text, target) {
  const destinations = [];
  const inline = /\]\(\s*(?:<([^>\r\n]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g;
  const definitions = /^\s{0,3}\[[^\]\r\n]+\]:\s*(?:<([^>\r\n]+)>|(\S+))/gm;
  const quoted = /`([^`\r\n]+)`/g;
  for (const expression of [inline, definitions]) {
    for (const match of text.matchAll(expression))
      destinations.push(match[1] ?? match[2]);
  }
  for (const match of text.matchAll(quoted)) {
    if (/^(?:\.\.?\/|\.ai-workspace\/|\/|file:)/.test(match[1]))
      destinations.push(match[1]);
  }
  return destinations.some((destination) => {
    const resolved = referencedPath(root, source, destination);
    return (
      resolved !== null &&
      (resolved === target || resolved.startsWith(target + "/"))
    );
  });
}

/**
 * Находит точный путь и его потомков с границами литерала; соседние имена не совпадают.
 * В TASK.md дополнительно разрешает документные ссылки относительно source.
 * @param {string} root Корень для лексического разрешения относительных ссылок.
 * @param {string} source Относительный путь документа.
 * @param {string} text
 * @param {string} target Проверенный относительный путь артефакта.
 * @param {boolean} dossier Разрешает разбор ссылок в соседнем TASK.md.
 * @returns {boolean}
 */
export function matchWorkspaceReferences(
  root,
  source,
  text,
  target,
  dossier = false,
) {
  const absolute = path.join(root, target);
  const needles = [
    target,
    `./${target}`,
    absolute,
    `file:${absolute}`,
    `file://${absolute}`,
    `file://localhost${absolute}`,
  ];
  return (
    needles.some((needle) => containsPathLiteral(text, needle)) ||
    (dossier && documentReferences(root, source, text, target))
  );
}
