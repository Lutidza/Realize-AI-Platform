/**
 * @file scripts/runtime/layout-reader/readLayoutReaderArtifact.adapter.mjs
 * @version 1.0.0
 * @date 2026-11-21
 * @description Читает ограниченный набор обычных compiled chunks указанного приложения без обхода symlink.
 * @see documentation/reports/2026-11-21-layout-reader-delivery-rollback-audit.md
 */
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export const artifactLimits = Object.freeze({
  files: 6000,
  bytes: 200 * 1024 * 1024,
  fileBytes: 32 * 1024 * 1024,
  depth: 24,
  factories: 70000,
  vmTimeoutMs: 1500,
});

export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

/** Только .next/server и .next/static/chunks; imports и внешние зависимости artifact не загружаются. */
export async function readLayoutReaderArtifact(directory) {
  const root = await realpath(resolve(directory));
  if (root !== resolve(directory))
    throw new Error(
      "Artifact root must be canonical and must not be a symlink.",
    );
  const files = [];
  let bytes = 0;
  async function regular(path, maxBytes = artifactLimits.fileBytes) {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes)
      throw new Error(
        `Artifact metadata/chunk is not a bounded regular file: ${relative(root, path)}`,
      );
    if (!(await realpath(path)).startsWith(`${root}${sep}`))
      throw new Error("Artifact file escaped its root.");
    return readFile(path);
  }
  const buildId = (await regular(join(root, ".next/BUILD_ID"), 256))
    .toString("utf8")
    .trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(buildId))
    throw new Error("Artifact BUILD_ID is invalid.");
  const buildManifestBytes = await regular(
    join(root, ".next/build-manifest.json"),
    1024 * 1024,
  );
  const buildManifest = JSON.parse(buildManifestBytes.toString("utf8"));
  if (
    !Array.isArray(buildManifest.rootMainFiles) ||
    !buildManifest.rootMainFiles.length ||
    buildManifest.rootMainFiles.length > 64 ||
    buildManifest.rootMainFiles.some(
      (path) =>
        typeof path !== "string" ||
        !/^static\/chunks\/[A-Za-z0-9_./%()[\]-]+\.js$/.test(path) ||
        path.split("/").includes(".."),
    )
  )
    throw new Error("Artifact initial client chunk graph is invalid.");
  async function walk(path, side, depth = 0) {
    if (depth > artifactLimits.depth)
      throw new Error("Artifact depth bound exceeded.");
    const stat = await lstat(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await realpath(path)) !== path
    )
      throw new Error(
        "Artifact chunk directory must be canonical and regular.",
      );
    const entries = (await readdir(path, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name, "en"),
    );
    for (const entry of entries) {
      if (entry.isSymbolicLink())
        throw new Error("Symlink in artifact chunk tree is unsupported.");
      if (
        ["node_modules", "cache", "static", "public", ".git"].includes(
          entry.name,
        )
      )
        continue;
      const next = join(path, entry.name);
      if (entry.isDirectory()) await walk(next, side, depth + 1);
      else if (entry.isFile() && entry.name.endsWith(".js")) {
        if (files.length >= artifactLimits.files)
          throw new Error("Artifact file bound exceeded.");
        const source = (await regular(next)).toString("utf8");
        bytes += Buffer.byteLength(source);
        if (bytes > artifactLimits.bytes)
          throw new Error("Artifact byte bound exceeded.");
        files.push({
          side,
          path: relative(root, next),
          source,
          hash: sha256(source),
        });
      }
    }
  }
  await walk(join(root, ".next/server"), "server");
  await walk(join(root, ".next/static/chunks"), "client");
  if (
    !files.some((file) => file.side === "server") ||
    !files.some((file) => file.side === "client")
  )
    throw new Error("Both server and client compiled chunks are required.");
  return {
    root,
    buildId,
    files,
    bytes,
    clientBootstrap: {
      manifestPath: ".next/build-manifest.json",
      manifestHash: sha256(buildManifestBytes),
      rootMainFiles: buildManifest.rootMainFiles,
    },
    chunkSetHash: sha256(
      JSON.stringify(
        files.map(({ side, path, hash }) => ({ side, path, hash })),
      ),
    ),
  };
}
