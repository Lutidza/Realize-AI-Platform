/**
 * @file packages/change-engine/src/parseCodePlan.validator.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет один явный code-plan block, не превращая ссылки на источники в права записи.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type { CodePlan } from "./CodePlan.types";

const MAX_BLOCK_BYTES = 256 * 1024;
const EXTENSIONLESS_FILES = new Set(["Dockerfile", "Makefile", "LICENSE"]);

const hasExactKeys = (
  value: unknown,
  keys: string[],
): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

const balancedSegment = (segment: string): boolean => {
  const stack: string[] = [];
  for (const character of segment) {
    if (character === "(" || character === "[") stack.push(character);
    else if (character === ")" || character === "]") {
      if (stack.pop() !== (character === ")" ? "(" : "[")) return false;
    }
  }
  return stack.length === 0;
};

const parseExactFilePath = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 240) return null;
  const path = value.startsWith("./") ? value.slice(2) : value;
  // Разрешены Next route segments; Markdown links, URL, glob и управляющие символы исключены.
  if (!/^[A-Za-z0-9@_./()[\]-]+$/.test(path) || /\]\(|\]\[/.test(path))
    return null;
  const segments = path.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !balancedSegment(segment),
    )
  )
    return null;
  const filename = segments.at(-1)!;
  // Существование проверяет execution; синтаксис никогда не создаёт directory/prefix scope.
  if (!/\.[A-Za-z0-9_-]+$/.test(filename) && !EXTENSIONLESS_FILES.has(filename))
    return null;
  return path;
};

/** Пример протокола внутри обычного Markdown fence остаётся текстом, включая backtick/tilde fences. */
const readCodePlanJSON = (content: string): string | null => {
  let offset = 0;
  let fenceSymbol = "";
  let fenceLength = 0;
  let protocol = false;
  let openingOffset = 0;
  let bodyOffset = 0;
  let json: string | null = null;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceSymbol) {
      if (
        fence &&
        fence[1]![0] === fenceSymbol &&
        fence[1]!.length >= fenceLength &&
        !fence[2]!.trim()
      ) {
        if (protocol) {
          if (json !== null) return null;
          const block = content.slice(openingOffset, offset + rawLine.length);
          if (
            block.length > MAX_BLOCK_BYTES ||
            new TextEncoder().encode(block).length > MAX_BLOCK_BYTES
          )
            return null;
          json = content.slice(bodyOffset, offset).trim();
        }
        fenceSymbol = "";
        protocol = false;
      }
    } else if (fence) {
      const delimiter = fence[1]!;
      const info = fence[2]!.trim();
      const candidate = /^realize-code-plan\b/.test(info);
      if (candidate && (delimiter !== "```" || info !== "realize-code-plan"))
        return null;
      // По Markdown backtick fence не открывается, если его info string содержит backtick.
      if (delimiter[0] !== "`" || !info.includes("`")) {
        fenceSymbol = delimiter[0]!;
        fenceLength = delimiter.length;
        protocol = candidate;
        openingOffset = offset;
        bodyOffset = offset + rawLine.length + 1;
      }
    }
    offset += rawLine.length + 1;
  }
  return protocol ? null : json;
};

/** Возвращает null для отсутствующего, неоднозначного или повреждённого блока без prose fallback. */
export const parseCodePlan = (content: string): CodePlan | null => {
  const json = readCodePlanJSON(content);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!hasExactKeys(parsed, ["version", "files"]) || parsed.version !== "1.0")
    return null;
  if (
    !Array.isArray(parsed.files) ||
    parsed.files.length < 1 ||
    parsed.files.length > 100
  )
    return null;
  const files: CodePlan["files"] = [];
  const paths = new Set<string>();
  for (const file of parsed.files) {
    if (
      !hasExactKeys(file, ["path", "change"]) ||
      typeof file.change !== "string"
    )
      return null;
    const path = parseExactFilePath(file.path);
    const change = file.change.trim();
    if (!path || paths.has(path) || !change || change.length > 2000)
      return null;
    paths.add(path);
    files.push({ path, change });
  }
  return { version: "1.0", files };
};
