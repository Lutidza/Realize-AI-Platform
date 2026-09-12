/**
 * @file packages/codex-adapter/src/createCodexChatPermissions.config.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Ограничивает native чтение аналитического чата его снимком и системными runtime-файлами.
 */

import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";

import type {
  CodexChatPermissions,
  OpenAICodexAdapterOptions,
} from "./OpenAICodex.types";

const contains = (root: string, path: string): boolean =>
  path === root || path.startsWith(root + sep);

// Имена filesystem entries интерпретируются Codex как glob; пути должны быть literal.
const literalPath = (path: string): boolean =>
  isAbsolute(path) &&
  resolve(path) === path &&
  !/[\x00-\x1f*?\[\]{}\\]/.test(path);

const executable = async (
  options: OpenAICodexAdapterOptions,
): Promise<string> => {
  const binary = options.codexBinary ?? "codex";
  const searchPath = options.environment.PATH ?? "/usr/bin:/bin";
  const candidates = isAbsolute(binary)
    ? [binary]
    : binary.includes(sep)
      ? []
      : searchPath
          .split(delimiter)
          .filter(isAbsolute)
          .map((root) => join(root, binary));
  for (const candidate of candidates) {
    try {
      const path = await realpath(candidate);
      if (!literalPath(path) || !(await stat(path)).isFile()) continue;
      await access(path, constants.X_OK);
      return path;
    } catch {
      /* Следующий каталог PATH может содержать штатный executable. */
    }
  }
  throw new Error("Codex chat runtime is unavailable.");
};

/** CLI 0.153.4 использует named permissions; новые ReadOnlyAccess RPC-поля ему неизвестны. */
export const createCodexChatPermissions = async (
  cwd: string,
  options: OpenAICodexAdapterOptions,
): Promise<CodexChatPermissions> => {
  if (
    !literalPath(cwd) ||
    (await realpath(cwd)) !== cwd ||
    !(await stat(cwd)).isDirectory()
  )
    throw new Error("Invalid chat snapshot.");
  const denied = [...(options.privateReadDenyPaths ?? [])];
  if (options.environment?.CODEX_HOME)
    denied.push(options.environment.CODEX_HOME);
  if (options.environment?.OPENAI_FEDERATION_RULE_ID) {
    const assertion = options.environment.OPENAI_IDENTITY_TOKEN_FILE;
    if (!assertion || !literalPath(assertion))
      throw new Error("Invalid chat credential boundary.");
    denied.push(dirname(assertion));
  }
  const binaryPath = await executable(options);
  const filesystem: CodexChatPermissions["profile"]["filesystem"] = {
    ":root": "deny",
    ":minimal": "read",
    [cwd]: "read",
    // Linux bwrap повторно запускает native binary; весь CODEX_HOME открывать нельзя.
    [binaryPath]: "read",
  };
  for (const path of new Set(denied)) {
    if (
      !literalPath(path) ||
      (await realpath(path)) !== path ||
      !(await stat(path)).isDirectory() ||
      contains(path, cwd) ||
      contains(path, binaryPath)
    )
      throw new Error("Invalid private chat storage boundary.");
    filesystem[path] = "deny";
  }
  return { binaryPath, profile: { filesystem, network: { enabled: false } } };
};
