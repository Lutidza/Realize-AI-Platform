/**
 * @file tests/e2e/support/taskManagerAcceptance/createFixtureIncludesGuard.adapter.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Удаляет только добавленные текущим Next процессом includes и сохраняет текущую конфигурацию.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  readFile,
  writeFile,
  rename,
  unlink,
  lstat,
  chmod,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { format, resolveConfig } from "prettier";
import { prepareFixtureNextDeclarations } from "./restoreFixtureNextDeclarations.adapter";
import type { FixtureIncludesGuard } from "./FixtureIncludes.types";
function parseIncludes(text: string): {
  include: string[];
  [key: string]: unknown;
} {
  const config = JSON.parse(text);
  if (
    !Array.isArray(config.include) ||
    config.include.some((p: unknown) => typeof p !== "string")
  )
    throw new Error("FIXTURE_TSCONFIG_INVALID");
  return config;
}
/** Вызывать после остановки Next; чужие добавления берутся из свежего файла, прежние own записи сохраняются. */
export async function createFixtureIncludesGuard(
  root: string,
  distDir: string,
): Promise<FixtureIncludesGuard> {
  const file = resolve(root, "tsconfig.json");
  const restoreDeclarations = await prepareFixtureNextDeclarations(
    root,
    distDir,
  );
  const previous = new Set(parseIncludes(await readFile(file, "utf8")).include);
  const owned = new Set([
    `${distDir}/types/**/*.ts`,
    `${distDir}/dev/types/**/*.ts`,
  ]);
  return {
    async restore() {
      await restoreDeclarations();
      const metadata = await lstat(file);
      if (!metadata.isFile() || metadata.isSymbolicLink())
        throw new Error("FIXTURE_TSCONFIG_UNSAFE");
      const before = await readFile(file, "utf8");
      const config = parseIncludes(before);
      const next = config.include.filter(
        (path) => !owned.has(path) || previous.has(path),
      );
      if (next.length === config.include.length) return;
      config.include = next;
      const bytes = await format(JSON.stringify(config), {
        ...(await resolveConfig(file)),
        parser: "json",
      });
      const temporary = resolve(
        root,
        `.tsconfig-fixture-${randomUUID()}.pending`,
      );
      try {
        await writeFile(temporary, bytes, {
          flag: "wx",
          mode: metadata.mode & 0o777,
        });
        await chmod(temporary, metadata.mode & 0o777);
        if ((await readFile(file, "utf8")) !== before)
          throw new Error("FIXTURE_TSCONFIG_CONFLICT");
        await rename(temporary, file);
      } finally {
        await unlink(temporary).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    },
  };
}
