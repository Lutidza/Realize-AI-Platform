/**
 * @file scripts/runtime/readProductionTracingRoot.config.mjs
 * @version 1.0.0
 * @date 2026-10-18
 * @description Ограничивает tracing корнем проекта, сохраняя общие зависимости вложенного снимка.
 * @see documentation/delivery/01-local-admin-ai.md
 */
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";

const contains = (root, path) => {
  const local = relative(root, path);
  return (
    local === "" ||
    (local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local))
  );
};

// У ещё не созданного state root проверяется ближайший существующий ancestor.
// realpath читает только metadata; содержимое хранилища не открывается.
const canonicalStateRoot = (path) => {
  try {
    return realpathSync(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return join(canonicalStateRoot(dirname(path)), basename(path));
  }
};

/**
 * Snapshot с общими dependencies должен находиться внутри исходного проекта.
 * Не расширяет область автоматически до общего предка временной папки и checkout.
 * @param {string} projectDirectory
 * @param {Partial<NodeJS.ProcessEnv>} environment
 * @returns {string}
 */
export function readProductionTracingRoot(
  projectDirectory,
  environment = process.env,
) {
  const project = realpathSync(projectDirectory);
  const requested = environment.REALIZE_BUILD_TRACING_ROOT ?? project;
  if (!isAbsolute(requested))
    throw new Error(
      "REALIZE_BUILD_TRACING_ROOT должен быть абсолютным путём проекта.",
    );
  const root = realpathSync(requested);
  if (
    root === parse(root).root ||
    root === realpathSync(homedir()) ||
    !contains(root, project)
  )
    throw new Error(
      "Tracing root должен ограничиваться проектом и содержать source snapshot.",
    );

  const manifest = (directory) =>
    JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  const projectName = manifest(project).name;
  if (typeof projectName !== "string" || manifest(root).name !== projectName)
    throw new Error(
      "Tracing root должен принадлежать тому же проекту, что и source snapshot.",
    );
  const require = createRequire(join(project, "package.json"));
  const nextPackage = realpathSync(require.resolve("next/package.json"));
  if (!contains(root, nextPackage))
    throw new Error(
      "Общие зависимости Next находятся вне tracing root; разместите snapshot внутри проекта и задайте REALIZE_BUILD_TRACING_ROOT.",
    );

  // Runtime-данные не являются входом сборки, включая явно перенесённое хранилище.
  const stateRoots = [join(homedir(), ".local/share/realize-ai-cms/codex")];
  if (environment.REALIZE_CODEX_STATE_ROOT)
    stateRoots.push(environment.REALIZE_CODEX_STATE_ROOT);
  for (const state of stateRoots) {
    if (!isAbsolute(state) || state.includes("\0"))
      throw new Error(
        "REALIZE_CODEX_STATE_ROOT должен быть абсолютным путём вне tracing root.",
      );
    if (
      [resolve(state), canonicalStateRoot(resolve(state))].some(
        (path) => contains(root, path) || contains(path, root),
      )
    )
      throw new Error(
        "Хранилище Codex находится внутри tracing root; вынесите runtime-данные за границу сборки.",
      );
  }
  return root;
}
