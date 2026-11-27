/**
 * @file services/ai-execution-worker/src/resolveTemplateWriteScope.service.ts
 * @version 1.0.0
 * @date 2026-11-27
 * @description Подтверждает владельца точных файлов назначения по декларативным метаданным workspace в базовом коммите.
 * @see documentation/architecture/decisions/ADR-0018-self-contained-template-packages.md
 */
import { posix } from "node:path";
import { z } from "zod";
import { Git } from "@realize/git-runtime";
import { templatePackageCandidate } from "@realize/change-engine";
import { parseTemplateManifest } from "@realize/template-contracts";

const packageMetadata = z.object({
  name: z.string(),
  exports: z.object({
    "./manifest.json": z.string().startsWith("./").endsWith(".json"),
  }),
});
const patterns = z.array(z.string());
const workspaceMetadata = z.object({
  workspaces: z.union([patterns, z.object({ packages: patterns })]),
});

/** ls-tree фиксирует mode и OID. Ни symlink, ни JS export не выполняются при выдаче прав. */
async function readJson(
  git: Git,
  commit: string,
  path: string,
): Promise<unknown> {
  const record = await git.run(["ls-tree", "-z", commit, "--", path]);
  const [entry, found] = record.split("\t");
  const blob = /^100(?:644|755) blob ([a-f0-9]{40,64})$/.exec(entry);
  if (!blob || found !== path + "\0") throw new Error("invalid metadata");
  return JSON.parse(await git.run(["cat-file", "blob", blob[1]]));
}

/** Результат строится только из writePaths и уже существующих в baseCommit SDK-пакетов. */
export async function resolveTemplateWriteScope(
  root: string,
  baseCommit: string,
  writePaths: readonly string[],
): Promise<ReadonlySet<string>> {
  const files = writePaths.filter((path) => path.startsWith("packages/"));
  if (!files.length) return new Set();
  if (!/^[a-f0-9]{40}$/.test(baseCommit))
    throw new Error("assignment_write_binding_changed");
  const git = new Git(root, {
    profile: "machine-read",
    maxOutputBytes: 256 * 1024,
  });
  let globs: string[];
  try {
    const { workspaces } = workspaceMetadata.parse(
      await readJson(git, baseCommit, "package.json"),
    );
    globs = Array.isArray(workspaces) ? workspaces : workspaces.packages;
  } catch {
    throw new Error("assignment_template_workspace_unavailable");
  }
  const owners = new Set<string>();
  const ancestors = new Set<string>();
  const nestedPackages = new Set<string>();
  for (const path of files) {
    const owner = templatePackageCandidate(path);
    if (!owner) throw new Error("assignment_write_scope_forbidden: " + path);
    owners.add(owner);
    for (
      let dir = posix.dirname(path);
      dir !== owner;
      dir = posix.dirname(dir)
    ) {
      ancestors.add(dir);
      nestedPackages.add(dir + "/package.json");
    }
  }
  for (const owner of owners) {
    try {
      const matches = (pattern: string) =>
        posix.matchesGlob(
          owner,
          pattern.replace(/^\.\//, "").replace(/\/$/, ""),
        );
      if (
        !globs.some((g) => !g.startsWith("!") && matches(g)) ||
        globs.some((g) => g.startsWith("!") && matches(g.slice(1)))
      )
        throw new Error("not a workspace");
      const pkg = packageMetadata.parse(
        await readJson(git, baseCommit, owner + "/package.json"),
      );
      const manifestPath =
        owner + "/" + pkg.exports["./manifest.json"].slice(2);
      if (templatePackageCandidate(manifestPath) !== owner)
        throw new Error("invalid export");
      const manifest = parseTemplateManifest(
        await readJson(git, baseCommit, manifestPath),
      );
      if (manifest.packageName !== pkg.name)
        throw new Error("package identity mismatch");
    } catch {
      throw new Error("assignment_template_package_unverified: " + owner);
    }
  }
  const verified = new Set(files);
  // Раздельные уровни не дают Git рекурсивно раскрывать общий родительский каталог.
  const levels = Map.groupBy(
    [...new Set([...files, ...ancestors, ...nestedPackages])],
    (path) => path.split("/").length,
  );
  for (const level of levels.values()) {
    const records = await git.run([
      "ls-tree",
      "-z",
      baseCommit,
      "--",
      ...level,
    ]);
    for (const record of records.split("\0").filter(Boolean)) {
      const [entry, path] = record.split("\t");
      if (nestedPackages.has(path))
        throw new Error("assignment_template_nested_owner: " + path);
      if (
        ancestors.has(path)
          ? !entry.startsWith("040000 tree ")
          : !/^100(?:644|755) blob /.test(entry)
      )
        throw new Error("assignment_write_unsafe_path: " + path);
    }
  }
  if (files.some((path) => ancestors.has(path)))
    throw new Error("assignment_write_scope_conflict");
  return verified;
}
