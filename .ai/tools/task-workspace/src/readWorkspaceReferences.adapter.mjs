/**
 * @file .ai/tools/task-workspace/src/readWorkspaceReferences.adapter.mjs
 * @version 1.1.0
 * @date 2026-10-13
 * @description Находит bounded source consumers и внешние ссылки досье без чтения runtime, секретов и собственных материалов.
 * @see documentation/specifications/task-management-execution.md
 */
import path from "node:path";
import { safeRelative } from "./WorkspaceFs.adapter.mjs";
import { fail } from "./Workspace.error.mjs";
const roots = [
  "src",
  "packages",
  "services",
  "scripts",
  ".ai/rules",
  ".ai/checks",
  ".ai/workflows",
  ".ai/tools",
  ".codex",
  "documentation",
  "README.md",
  "AGENTS.md",
  "package.json",
  "tsconfig.json",
  "next-env.d.ts",
  "next.config.ts",
  "playwright.config.ts",
];
const skipped = new Set(["node_modules", ".git", ".next"]);
const supported = /\.(?:ts|tsx|js|mjs|cjs|json|md|ya?ml|toml)$/;
const maxFiles = 15000;
const maxDossiers = 2048;
const maxBytes = 2 * 1024 * 1024;

/** Лексическое разрешение не открывает target документа и не следует symlink. */
function referencedPath(storage, source, destination) {
  let value = destination.trim();
  if (!value || /[\x00-\x1f\\]/.test(value)) return null;
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
    absolute = path.resolve(storage.root, value);
  else absolute = path.resolve(storage.root, path.dirname(source), value);
  const relative = path.relative(storage.root, absolute);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  )
    return null;
  return relative;
}

/** Markdown links/definitions и quoted paths сохраняют межзадачные ссылки TASK.md. */
function documentReferences(storage, source, text, target) {
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
    const resolved = referencedPath(storage, source, destination);
    return (
      resolved !== null &&
      (resolved === target || resolved.startsWith(target + "/"))
    );
  });
}

/** Возвращает только пути consumers; собственные logs/tmp и содержимое документов не выдаются. */
export function sourceReferences(storage, relative) {
  const target = safeRelative(relative);
  const ownDossier =
    /^\.ai-workspace\/(?:tasks|history)\/[^/]+/.exec(target)?.[0] ?? null;
  const needles = [target, path.join(storage.root, target)];
  const hits = new Set();
  let count = 0;
  const stat = (file) => {
    try {
      return storage.stat(file);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  };
  const inspect = (file, dossier = false) => {
    if (++count > maxFiles) fail("reference_scan_limit");
    const entry = stat(file);
    if (!entry || entry.isSymbolicLink()) return;
    if (entry.isDirectory()) {
      for (const name of storage.list(file)) {
        const child = `${file}/${name}`;
        if (
          skipped.has(name) ||
          /^\.ai\/tools\/[^/]+\/runtime(?:\/|$)/.test(child)
        )
          continue;
        if (/^documentation\/(?:reports|temp)(?:\/|$)/.test(child)) continue;
        if (
          name.startsWith(".env") ||
          /^(?:credentials|auth)\.json$/.test(name)
        )
          continue;
        inspect(child);
      }
      return;
    }
    if (
      !entry.isFile() ||
      !supported.test(file) ||
      entry.size > BigInt(maxBytes)
    )
      return;
    const text = storage.read(file, maxBytes).toString("utf8");
    if (
      needles.some((needle) => text.includes(needle)) ||
      (dossier && documentReferences(storage, file, text, target))
    )
      hits.add(file);
  };
  for (const root of roots) inspect(root);

  // Читаются только соседние TASK.md: их evidence/tmp не становятся recursive corpus.
  let dossiers = 0;
  for (const base of [".ai-workspace/tasks", ".ai-workspace/history"]) {
    const parent = stat(base);
    if (!parent || parent.isSymbolicLink() || !parent.isDirectory()) continue;
    for (const name of storage.list(base)) {
      if (++dossiers > maxDossiers) fail("reference_scan_limit");
      const directory = `${base}/${name}`;
      if (directory === ownDossier) continue;
      const entry = stat(directory);
      if (!entry || entry.isSymbolicLink() || !entry.isDirectory()) continue;
      inspect(`${directory}/TASK.md`, true);
    }
  }
  return [...hits].sort();
}
