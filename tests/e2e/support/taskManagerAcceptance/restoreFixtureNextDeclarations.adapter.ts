/**
 * @file tests/e2e/support/taskManagerAcceptance/restoreFixtureNextDeclarations.adapter.ts
 * @version 1.0.1
 * @date 2026-10-15
 * @description Восстанавливает свой generated Next types pointer штатным генератором, сохраняя чужие изменения.
 * @see documentation/specifications/task-management-execution.md
 */
import { readFile, mkdtemp, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { writeAppTypeDeclarations } from "next/dist/lib/typescript/writeAppTypeDeclarations";
import { safeRelative } from "../../../../.ai/tools/task-workspace/src/filesystem/safeRelative.validator.mjs";
/** Возвращает restore только для recognized SDK output, переданный снимок не записывается вручную. */
export async function prepareFixtureNextDeclarations(
  root: string,
  ownDist: string,
): Promise<() => Promise<void>> {
  const file = resolve(root, "next-env.d.ts");
  const originalMetadata = await requireDeclarationFile(file);
  const original = await readFile(file, "utf8");
  await requireDeclarationFile(file, originalMetadata);
  const route = /^import "\.\/(.+)\/types\/routes\.d\.ts";$/m.exec(original);
  if (!route) throw new Error("FIXTURE_NEXT_DECLARATIONS_UNRECOGNIZED");
  const dist = safeRelative(route[1]);
  const flags = {
    imageImportsEnabled: original.includes('types="next/image-types/global"'),
    hasAppDir: original.includes("/docs/app/"),
    hasPagesDir:
      original.includes("/docs/pages/") ||
      original.includes('types="next/navigation-types/compat/navigation"'),
    strictRouteTypes: original.includes('/types/cache-life.d.ts"'),
    typedRoutes: original.includes('/types/link.d.ts"'),
  };
  // Не запускаем Next над файлом, который уже содержит сторонние declarations.
  if (
    original.replace(/\r\n/g, "\n") !==
    (await generatedDeclarations(dist, flags))
  )
    throw new Error("FIXTURE_NEXT_DECLARATIONS_UNRECOGNIZED");
  return async () => {
    const currentMetadata = await requireDeclarationFile(
      file,
      originalMetadata,
    );
    const current = await readFile(file, "utf8");
    const currentRoute = /^import "\.\/(.+)\/types\/routes\.d\.ts";$/m.exec(
      current,
    );
    const currentDist = currentRoute?.[1];
    if (currentDist !== ownDist && currentDist !== `${ownDist}/dev`) return;
    // Сравнение с результатом SDK не позволяет удалить произвольные чужие declarations.
    const expected = await generatedDeclarations(currentDist, flags);
    if (current.replace(/\r\n/g, "\n") !== expected)
      throw new Error("FIXTURE_NEXT_DECLARATIONS_CONFLICT");
    if ((await readFile(file, "utf8")) !== current)
      throw new Error("FIXTURE_NEXT_DECLARATIONS_CONFLICT");
    await requireDeclarationFile(file, currentMetadata);
    await writeAppTypeDeclarations({
      baseDir: root,
      distDir: dist,
      ...flags,
    });
  };
}

/** Generated writer работает только с прежним regular root file, без symlink или подмены inode. */
async function requireDeclarationFile(
  file: string,
  expected?: { dev: number; ino: number },
) {
  const metadata = await lstat(file);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (expected &&
      (metadata.dev !== expected.dev || metadata.ino !== expected.ino))
  )
    throw new Error("FIXTURE_NEXT_DECLARATIONS_CONFLICT");
  return metadata;
}

/** SDK создаёт эталон в отдельном каталоге без изменения project generated files. */
async function generatedDeclarations(
  distDir: string,
  flags: Omit<
    Parameters<typeof writeAppTypeDeclarations>[0],
    "baseDir" | "distDir"
  >,
) {
  const scratch = await mkdtemp(join(tmpdir(), "realize-next-declarations-"));
  try {
    await writeAppTypeDeclarations({ baseDir: scratch, distDir, ...flags });
    return (await readFile(join(scratch, "next-env.d.ts"), "utf8")).replace(
      /\r\n/g,
      "\n",
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
