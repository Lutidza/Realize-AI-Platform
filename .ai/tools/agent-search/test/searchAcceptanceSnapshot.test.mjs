/**
 * @file .ai/tools/agent-search/test/searchAcceptanceSnapshot.test.mjs
 * @version 1.0.0
 * @date 2026-10-18
 * @description Проверяет полноту локальных импортов реального source snapshot и ограниченную область копирования.
 * @see documentation/architecture/repository-search.md
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createSearchAcceptanceSnapshot } from "../acceptance/createSearchAcceptanceSnapshot.adapter.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const sourceExtension = /\.[cm]?[jt]sx?$/i;
const assetExtension =
  /\.(?:css|scss|sass|less|svg|png|jpe?g|webp|gif|ico|avif|woff2?|ttf|otf|mp[34]|webm|wasm)$/i;

// Paths используются только для классификации imports и filesystem-проверки assets.
function aliasTargets(specifier, options, site) {
  return Object.entries(options.paths ?? {}).flatMap(([pattern, targets]) => {
    const [prefix, suffix = ""] = pattern.split("*");
    const wildcard = pattern.includes("*");
    if (
      wildcard
        ? !specifier.startsWith(prefix) ||
          !specifier.endsWith(suffix) ||
          specifier.length < prefix.length + suffix.length
        : specifier !== pattern
    )
      return [];
    const matched = specifier.slice(
      prefix.length,
      specifier.length - suffix.length,
    );
    return targets.map((target) =>
      resolve(options.baseUrl ?? site, target.replace("*", matched)),
    );
  });
}

test("snapshot содержит замкнутый граф локальных импортов без лишних release и AI sources", async (t) => {
  const tasks = join(root, ".ai-workspace/tasks");
  await mkdir(tasks, { recursive: true });
  const directory = await mkdtemp(join(tasks, "2026-10-18-source-snapshot-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const snapshot = await createSearchAcceptanceSnapshot(root, directory, {
    readinessMarker: false,
  });
  const site = await realpath(snapshot.site);
  for (const excluded of [
    ".env",
    ".codex",
    ".ai/registry",
    "scripts/release/createPlatformSourceInventory.service.ts",
    ".ai/tools/quality/checkInstructions.controller.ts",
  ])
    assert.equal(existsSync(join(site, excluded)), false, excluded);

  const config = ts.readConfigFile(
    join(site, "tsconfig.json"),
    ts.sys.readFile,
  );
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, site);
  assert.deepEqual(parsed.errors, []);
  assert.ok(
    parsed.fileNames.length,
    "tsconfig должен включать исходники snapshot",
  );
  const cache = ts.createModuleResolutionCache(
    site,
    (file) => file,
    parsed.options,
  );
  const queue = [...parsed.fileNames];
  const visited = new Set();
  const failures = new Set();
  for (let index = 0; index < queue.length; index++) {
    const file = await realpath(queue[index]);
    assert.ok(
      file.startsWith(`${site}${sep}`),
      `Источник вне snapshot: ${file}`,
    );
    if (visited.has(file)) continue;
    visited.add(file);
    const imports = ts.preProcessFile(await readFile(file, "utf8"), true, true);
    for (const { fileName: specifier } of imports.importedFiles) {
      // Эти declaration files создаёт next typegen перед tsc; готовая .next не копируется.
      if (
        file === join(site, "next-env.d.ts") &&
        specifier.startsWith("./.next/types/") &&
        specifier.endsWith(".d.ts")
      )
        continue;
      const aliases = aliasTargets(specifier, parsed.options, site);
      const relativeImport = specifier.startsWith(".");
      if (
        !relativeImport &&
        !aliases.length &&
        !specifier.startsWith("@realize/")
      )
        continue;
      const label = `${relative(site, file)} → ${specifier}`;
      let target = ts.resolveModuleName(
        specifier,
        file,
        parsed.options,
        ts.sys,
        cache,
      ).resolvedModule?.resolvedFileName;
      if (!target && assetExtension.test(specifier)) {
        const candidates = relativeImport
          ? [resolve(dirname(file), specifier)]
          : aliases;
        target = candidates.find((candidate) => existsSync(candidate));
      }
      if (!target) {
        failures.add(`Не разрешён import: ${label}`);
        continue;
      }
      const canonical = await realpath(target);
      if (!canonical.startsWith(`${site}${sep}`)) {
        failures.add(`Import вышел из snapshot: ${label}`);
        continue;
      }
      if (sourceExtension.test(canonical)) queue.push(canonical);
    }
  }
  assert.equal(failures.size, 0, [...failures].sort().join("\n"));
});
