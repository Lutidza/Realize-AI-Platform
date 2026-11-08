/**
 * @file scripts/buildEngineeringNative.mjs
 * @version 1.0.0
 * @date 2026-10-26
 * @description Явно собирает trusted Node-API 8 artifact вне checkout с private manifest и hashes.
 * @see documentation/architecture/engineering-operations.md
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const repository = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const source = join(
  repository,
  "packages/engineering-runtime/native/engineeringFilesystem.c",
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function assertDirectoryChain(path) {
  let current = parse(path).root;
  for (const component of path
    .slice(current.length)
    .split(sep)
    .filter(Boolean)) {
    current = join(current, component);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Output/include path содержит symlink или иной тип.");
  }
}

function writeDurable(path, bytes) {
  const descriptor = openSync(
    path,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

try {
  if (process.platform !== "linux" || process.versions.node !== "24.18.0")
    throw new Error("Сборка требует Linux и Node.js 24.18.0.");
  const argumentsList = process.argv.slice(2);
  const options = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (
      !["--output", "--include"].includes(flag) ||
      !value ||
      options.has(flag) ||
      !isAbsolute(value) ||
      value.includes("\0")
    )
      throw new Error(
        "Использование: node scripts/buildEngineeringNative.mjs --output <absolute-private-directory> [--include <absolute-headers-directory>].",
      );
    options.set(flag, resolve(value));
  }
  const output = options.get("--output");
  if (!output) throw new Error("Обязателен --output вне checkout.");
  const include = options.get("--include") ?? "/usr/include/node";
  const distance = relative(repository, output);
  if (
    !distance ||
    (!distance.startsWith(`..${sep}`) &&
      distance !== ".." &&
      !isAbsolute(distance))
  )
    throw new Error("Native build output должен находиться вне checkout.");
  assertDirectoryChain(dirname(output));
  assertDirectoryChain(include);
  try {
    mkdirSync(output, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  assertDirectoryChain(output);
  const owner = lstatSync(output);
  if (owner.uid !== process.getuid() || (owner.mode & 0o7777) !== 0o700)
    throw new Error("Output должен принадлежать процессу и иметь mode 0700.");
  const sourceSha256 = digest(readFileSync(source));
  const staging = mkdtempSync(join(output, ".build-"));
  let bytes;
  try {
    const compiled = join(staging, "engineeringFilesystem.node");
    // Только явная developer build-команда; runtime loader этот script не импортирует и не вызывает.
    execFileSync(
      "cc",
      [
        "-std=c11",
        "-O2",
        "-fPIC",
        "-shared",
        "-fvisibility=hidden",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-DNAPI_VERSION=8",
        "-I",
        include,
        source,
        "-o",
        compiled,
      ],
      {
        timeout: 60_000,
        maxBuffer: 256 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    chmodSync(compiled, 0o600);
    bytes = readFileSync(compiled);
    if (digest(readFileSync(source)) !== sourceSha256)
      throw new Error("Native source изменился во время сборки.");
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  const path = join(output, "engineeringFilesystem.node");
  const manifestPath = join(output, "engineeringFilesystem.manifest.json");
  const sha256 = digest(bytes);
  const manifest = {
    schemaVersion: 1,
    binary: "engineeringFilesystem.node",
    sha256,
    sourceSha256,
    napiVersion: 8,
    nodeVersion: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
  };
  writeDurable(path, bytes);
  writeDurable(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const directory = openSync(
    output,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
  const parent = openSync(
    dirname(output),
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
  process.stdout.write(
    `${JSON.stringify({ path, sha256, manifestPath, napiVersion: 8 })}\n`,
  );
} catch (error) {
  process.stderr.write(`Native build: ${error.message}\n`);
  if (error.stderr) process.stderr.write(error.stderr);
  process.exitCode = 1;
}
