/**
 * @file .ai/tools/agent-search/src/installedSearchBinding.adapter.mjs
 * @version 1.2.0
 * @date 2026-09-30
 * @description Связывает прошедшую штатную сборку с bounded search source hash и фактическим Next BUILD_ID.
 * @see documentation/architecture/repository-search.md
 */
import {
  lstat,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, resolve, relative } from "node:path";
import { randomUUID } from "node:crypto";
// CLI owner остаётся Node-only: reading generated manifest не требует зависимостей root приложения.
const parseBinding = (value) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    value.schemaVersion !== "1.0" ||
    typeof value.sourceVersion !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sourceVersion) ||
    typeof value.installedBuildID !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.installedBuildID) ||
    typeof value.builtAt !== "string" ||
    !Number.isFinite(Date.parse(value.builtAt)) ||
    new Date(value.builtAt).toISOString() !== value.builtAt
  )
    throw Error("search_build_binding_invalid");
  return value;
};
// Каталог выбирает build/runtime owner. Только файлы manifest и BUILD_ID обязаны быть regular и canonical.
const dist = (root, environment) =>
  realpath(resolve(root, environment.REALIZE_NEXT_DIST_DIR || ".next"));
const boundedRead = async (path, limit) => {
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > limit ||
    (await realpath(path)) !== path
  )
    throw Error("search_build_binding_invalid");
  const text = await readFile(path, "utf8");
  if (Buffer.byteLength(text) > limit)
    throw Error("search_build_binding_limit");
  return text;
};
const activeDirectoryIsValid = (directory) =>
  typeof directory === "string" &&
  directory.startsWith(".next/") &&
  !directory.includes("\\") &&
  !directory
    .split("/")
    .some((segment) => segment === "." || segment === ".." || !segment);
/** Только штатный build owner вызывает writer после typegen/tsc/build и проверки неизменности sources. */
export async function writeInstalledSearchBinding(
  root,
  sourceVersion,
  environment = process.env,
) {
  const directory = await dist(root, environment);
  const installedBuildID = (
    await boundedRead(join(directory, "BUILD_ID"), 256)
  ).trim();
  const binding = parseBinding({
    schemaVersion: "1.0",
    sourceVersion,
    installedBuildID,
    builtAt: new Date().toISOString(),
  });
  const directories = [directory];
  // Next standalone имеет собственную .next; health читает receipt именно работающего bundle.
  const requiredPath = join(directory, "required-server-files.json");
  let required;
  try {
    required = JSON.parse(await boundedRead(requiredPath, 256 * 1024));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (required) {
    const relative = required.relativeAppDir;
    if (
      typeof relative !== "string" ||
      isAbsolute(relative) ||
      relative.split(/[\\/]/).includes("..")
    )
      throw Error("search_build_standalone_invalid");
    const runtimeDirectory = await realpath(
      join(directory, "standalone", relative, ".next"),
    );
    if (
      (await boundedRead(join(runtimeDirectory, "BUILD_ID"), 256)).trim() !==
      installedBuildID
    )
      throw Error("search_build_standalone_mismatch");
    const standalone = await realpath(join(directory, "standalone"));
    if (!runtimeDirectory.startsWith(standalone + "/"))
      throw Error("search_build_standalone_invalid");
    directories.unshift(runtimeDirectory);
  }
  for (const target of directories) {
    const temporary = join(
      target,
      `.realize-search-build-${randomUUID()}.json`,
    );
    await writeFile(temporary, JSON.stringify(binding) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    try {
      await rename(temporary, join(target, "realize-search-build.json"));
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return binding;
}
/** Читает только actual compiled receipt/BUILD_ID, без сканирования source checkout или подключения к БД. */
export async function readCompiledSearchBinding(
  root,
  environment = process.env,
) {
  try {
    const directory = await dist(root, environment);
    const binding = parseBinding(
      JSON.parse(
        await boundedRead(join(directory, "realize-search-build.json"), 4096),
      ),
    );
    if (
      (await boundedRead(join(directory, "BUILD_ID"), 256)).trim() !==
      binding.installedBuildID
    )
      return undefined;
    return binding;
  } catch {
    return undefined;
  }
}
/** Старый/чужой BUILD_ID и изменённые sources не получают отметку установленной версии. */
export async function readInstalledSearchBinding(
  root,
  sourceVersion,
  environment = process.env,
) {
  if (!sourceVersion) return undefined;
  try {
    const base = await realpath(resolve(root, ".next"));
    // Generated activation receipt учитывает отдельный web bundle, сохраняя прежний .next для других consumers.
    let active;
    try {
      active = JSON.parse(
        await boundedRead(join(base, "realize-search-active.json"), 4096),
      );
    } catch (error) {
      if (error?.code !== "ENOENT") return undefined;
    }
    if (active !== undefined) {
      if (
        !active ||
        typeof active !== "object" ||
        Array.isArray(active) ||
        Object.keys(active).length !== 3 ||
        active.sourceVersion !== sourceVersion ||
        !activeDirectoryIsValid(active.directory) ||
        typeof active.installedBuildID !== "string"
      )
        return undefined;
      const target = await realpath(resolve(root, active.directory));
      if (!target.startsWith(base + "/")) return undefined;
      const installed = await readCompiledSearchBinding(root, {
        ...environment,
        REALIZE_NEXT_DIST_DIR: target,
      });
      return installed?.sourceVersion === sourceVersion &&
        installed.installedBuildID === active.installedBuildID
        ? installed
        : undefined;
    }
    const binding = await readCompiledSearchBinding(root, environment);
    return binding?.sourceVersion === sourceVersion ? binding : undefined;
  } catch {
    return undefined;
  }
}
/** Install owner вызывает только после проверки actual health ответа и текущих sources; pointer не редактируется вручную. */
export async function activateInstalledSearchBinding(
  root,
  directory,
  sourceVersion,
  activeBuild,
) {
  const target = await realpath(resolve(root, directory)),
    base = await realpath(resolve(root, ".next"));
  if (!target.startsWith(base + "/"))
    throw Error("search_active_binding_scope");
  const compiled = await readCompiledSearchBinding(root, {
    NODE_ENV: "production",
    REALIZE_NEXT_DIST_DIR: target,
  });
  if (
    compiled?.sourceVersion !== sourceVersion ||
    compiled.installedBuildID !== activeBuild?.installedBuildID ||
    compiled.sourceVersion !== activeBuild?.sourceVersion
  )
    throw Error("search_active_binding_mismatch");
  const value = {
    directory: relative(await realpath(root), target),
    sourceVersion,
    installedBuildID: compiled.installedBuildID,
  };
  if (!activeDirectoryIsValid(value.directory))
    throw Error("search_active_binding_scope");
  const temporary = join(base, `.realize-search-active-${randomUUID()}.json`);
  await writeFile(temporary, JSON.stringify(value) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await rename(temporary, join(base, "realize-search-active.json"));
  } finally {
    await rm(temporary, { force: true });
  }
  return compiled;
}
