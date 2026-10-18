/**
 * @file scripts/runtime/standalone/prepareStandaloneBundle.adapter.mjs
 * @version 1.0.0
 * @date 2026-10-18
 * @description Создаёт переносимую копию standalone с внутренними ссылками и статическими ресурсами.
 * @see documentation/delivery/01-local-admin-ai.md
 */
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
} from "node:path";
import {
  assertStandalonePath,
  isWithinStandalone,
} from "./standalonePaths.validator.mjs";

async function readRegularFile(root, path) {
  assertStandalonePath(path);
  const canonical = await realpath(path);
  assertStandalonePath(canonical);
  if (!(await lstat(path)).isFile() || !isWithinStandalone(root, canonical)) {
    throw new Error(
      "Standalone metadata должна быть обычным файлом внутри source.",
    );
  }
  return readFile(path);
}

async function readDirectory(root, path) {
  assertStandalonePath(path);
  if (
    !(await lstat(path)).isDirectory() ||
    (await realpath(path)) !== path ||
    !isWithinStandalone(root, path)
  ) {
    throw new Error(
      "Standalone source directory выходит за свою границу или является symlink.",
    );
  }
  return path;
}

async function readBuild(site) {
  const required = JSON.parse(
    await readRegularFile(site, join(site, ".next/required-server-files.json")),
  );
  const tracingRoot = required.config?.outputFileTracingRoot;
  const app = required.relativeAppDir;
  if (
    typeof tracingRoot !== "string" ||
    !isAbsolute(tracingRoot) ||
    tracingRoot === parse(tracingRoot).root ||
    tracingRoot === homedir() ||
    (await realpath(tracingRoot)) !== tracingRoot ||
    !isWithinStandalone(tracingRoot, site)
  ) {
    throw new Error(
      "Standalone tracing root должен ограничивать исходный проект.",
    );
  }
  if (
    typeof app !== "string" ||
    isAbsolute(app) ||
    app.includes("\\") ||
    app.split("/").includes("..") ||
    app !== relative(tracingRoot, site) ||
    required.appDir !== site
  ) {
    throw new Error(
      "Standalone relativeAppDir не соответствует source и tracing root.",
    );
  }
  const standalone = await readDirectory(site, join(site, ".next/standalone"));
  const staticDirectory = await readDirectory(site, join(site, ".next/static"));
  const buildIDBytes = await readRegularFile(
    site,
    join(site, ".next/BUILD_ID"),
  );
  const receipt = await readRegularFile(
    site,
    join(site, ".next/realize-search-build.json"),
  );
  const buildID = buildIDBytes.toString("utf8").trim();
  const binding = JSON.parse(receipt);
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(buildID) ||
    !binding ||
    Object.keys(binding).length !== 4 ||
    binding.schemaVersion !== "1.0" ||
    !/^[a-f0-9]{64}$/.test(binding.sourceVersion) ||
    binding.installedBuildID !== buildID ||
    typeof binding.builtAt !== "string" ||
    !Number.isFinite(Date.parse(binding.builtAt)) ||
    new Date(binding.builtAt).toISOString() !== binding.builtAt
  ) {
    throw new Error(
      "Standalone BUILD_ID или search receipt не соответствует контракту.",
    );
  }
  for (const [name, bytes] of [
    ["BUILD_ID", buildIDBytes],
    ["realize-search-build.json", receipt],
  ]) {
    if (
      !bytes.equals(
        await readRegularFile(standalone, join(standalone, app, ".next", name)),
      )
    ) {
      throw new Error("Standalone identity не совпадает с исходной сборкой.");
    }
  }
  await readRegularFile(standalone, join(standalone, app, "server.js"));
  return {
    site,
    tracingRoot,
    relativeAppDir: app,
    standalone,
    staticDirectory,
    buildID,
  };
}

/**
 * Упаковывает готовую сборку в новый каталог; raw output и compiled identity не изменяет.
 * Зависимости должны уже присутствовать в traced bundle. Исходный node_modules не копируется.
 * @param {string} sourceSite Каталог приложения, в котором завершилась production-сборка.
 * @param {string} outputDirectory Новый каталог пакета с существующим родителем.
 */
export async function prepareStandaloneBundle(sourceSite, outputDirectory) {
  const site = await realpath(resolve(sourceSite));
  const build = await readBuild(site);
  const destination = join(
    await realpath(dirname(resolve(outputDirectory))),
    basename(resolve(outputDirectory)),
  );
  assertStandalonePath(destination);
  if (
    isWithinStandalone(destination, site) ||
    [build.standalone, build.staticDirectory, join(site, "public")].some(
      (source) => isWithinStandalone(source, destination),
    )
  ) {
    throw new Error("Standalone output пересекается с копируемым source.");
  }
  // EEXIST останавливает операцию до блока cleanup: чужой output никогда не удаляется.
  await mkdir(destination);
  const links = [];
  const files = new Set();
  let rewrittenSymlinks = 0;

  async function copyTree(source, target, kind, local = "") {
    await mkdir(target, { recursive: true });
    // В Media читается только статический logo из source allowlist; uploads не обходятся.
    const names =
      kind === "public" && local === "media"
        ? ["logo.svg"]
        : await readdir(source);
    for (const name of names) {
      const from = join(source, name),
        to = join(target, name);
      assertStandalonePath(from);
      const rawMedia = join(build.relativeAppDir, "public/media");
      const rawLocal = relative(build.standalone, from);
      if (
        kind === "standalone" &&
        isWithinStandalone(join(build.standalone, rawMedia), from) &&
        rawLocal !== rawMedia &&
        rawLocal !== join(rawMedia, "logo.svg")
      ) {
        throw new Error("Standalone содержит runtime Media storage.");
      }
      const stat = await lstat(from).catch((error) => {
        if (kind === "public" && local === "media" && error.code === "ENOENT")
          return null;
        throw error;
      });
      if (!stat) continue;
      const mediaDirectory =
        kind === "public"
          ? local === "" && name === "media"
          : kind === "standalone" && rawLocal === rawMedia;
      const mediaLogo =
        kind === "public"
          ? local === "media"
          : kind === "standalone" && rawLocal === join(rawMedia, "logo.svg");
      if (
        (mediaDirectory && !stat.isDirectory()) ||
        (mediaLogo && !stat.isFile())
      ) {
        throw new Error(
          "Standalone Media допускает только обычный статический logo.svg.",
        );
      }
      if (stat.isDirectory()) {
        await copyTree(from, to, kind, join(local, name));
      } else if (stat.isFile()) {
        const existing = await lstat(to).catch((error) => {
          if (error.code === "ENOENT") return null;
          throw error;
        });
        if (existing) {
          if (
            !existing.isFile() ||
            !(await readFile(from)).equals(await readFile(to))
          ) {
            throw new Error(
              "Standalone asset collision: исходники не совпадают с traced bundle.",
            );
          }
        } else {
          await copyFile(from, to, constants.COPYFILE_EXCL);
        }
        files.add(to);
      } else if (stat.isSymbolicLink() && kind === "standalone") {
        const original = await readlink(from);
        const lexicalTarget = resolve(dirname(from), original);
        assertStandalonePath(lexicalTarget);
        if (
          !isWithinStandalone(build.standalone, lexicalTarget) &&
          !isWithinStandalone(build.tracingRoot, lexicalTarget)
        ) {
          throw new Error("Standalone symlink target выходит за tracing root.");
        }
        const actual = await realpath(from);
        assertStandalonePath(actual);
        let tracedTarget = actual;
        if (!isWithinStandalone(build.standalone, actual)) {
          if (!isWithinStandalone(build.tracingRoot, actual))
            throw new Error(
              "Standalone symlink target выходит за tracing root.",
            );
          tracedTarget = join(
            build.standalone,
            relative(build.tracingRoot, actual),
          );
        }
        // Проверяем только metadata: отсутствие traced target не разрешает чтение внешнего пакета.
        const tracedActual = await realpath(tracedTarget);
        assertStandalonePath(tracedActual);
        if (!isWithinStandalone(build.standalone, tracedActual))
          throw new Error("Standalone не содержит внутренний traced target.");
        const relocatedTarget = join(
          destination,
          relative(build.standalone, tracedActual),
        );
        const nextTarget = relative(dirname(to), relocatedTarget);
        if (original !== nextTarget) rewrittenSymlinks++;
        links.push({ path: to, target: nextTarget });
      } else {
        throw new Error(
          "Standalone source содержит недопустимый тип файла или symlink asset.",
        );
      }
    }
  }

  try {
    await copyTree(build.standalone, destination, "standalone");
    const appDirectory = join(destination, build.relativeAppDir);
    await copyTree(
      build.staticDirectory,
      join(appDirectory, ".next/static"),
      "static",
    );
    const publicDirectory = join(site, "public");
    const publicStat = await lstat(publicDirectory).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (publicStat) {
      await readDirectory(site, publicDirectory);
      await copyTree(publicDirectory, join(appDirectory, "public"), "public");
    }
    // Ссылки создаются после обычных файлов: копирование не следует через входной symlink.
    for (const link of links) await symlink(link.target, link.path);
    for (const link of links) {
      const actual = await realpath(link.path);
      assertStandalonePath(actual);
      if (!isWithinStandalone(destination, actual))
        throw new Error("Standalone symlink не замкнут внутри пакета.");
    }
    return {
      directory: destination,
      appDirectory,
      relativeAppDir: build.relativeAppDir,
      buildID: build.buildID,
      files: files.size,
      symlinks: links.length,
      rewrittenSymlinks,
    };
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}
