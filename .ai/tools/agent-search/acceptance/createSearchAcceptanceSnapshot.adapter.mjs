/**
 * @file .ai/tools/agent-search/acceptance/createSearchAcceptanceSnapshot.adapter.mjs
 * @version 1.3.1
 * @date 2026-10-18
 * @description Создаёт disposable source snapshot для Next: генерация и cache не затрагивают рабочий checkout.
 * @see documentation/architecture/repository-search.md
 */
import {
  cp,
  lstat,
  mkdir,
  realpath,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { randomBytes } from "node:crypto";

/** Включены исходники и необходимые assets; .env, runtime-данные, uploads и установленные зависимости не копируются. */
export async function createSearchAcceptanceSnapshot(
  root,
  directory,
  { readinessMarker = true } = {},
) {
  const site = join(directory, "site");
  await mkdir(site); // Уже существующий каталог не переиспользуется.
  const excluded = new Set([
    "node_modules",
    ".next",
    "dist",
    "coverage",
    ".git",
    "uploads",
  ]);
  const entries = [
    "src",
    "packages",
    "services",
    "scripts/runtime",
    // Транзитивные imports скриптов evaluation входят в проверку TypeScript снимка.
    "scripts/release/readReleaseSourceFiles.adapter.ts",
    "scripts/release/PlatformSourceInventory.types.ts",
    ".ai/tools/quality/checkInstructionGraph.service.ts",
    ".ai/tools/quality/instructionQuality.config.ts",
    ".ai/tools/quality/parseInstructionMetadata.mapper.ts",
    ".ai/tools/quality/readMarkdownLinks.util.ts",
    ".ai/tools/quality/InstructionQuality.types.ts",
    ".ai/tools/agent-search/src",
    ".ai/tools/agent-search/bin",
    ".ai/tools/agent-search/package-lock.json",
    ".ai/tools/git-delivery/src",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next-env.d.ts",
    "next.config.ts",
    "postcss.config.js",
    "tailwind.config.mjs",
    "public/favicon.svg",
    "public/media/logo.svg",
  ];
  for (const entry of entries) {
    const from = join(root, entry),
      to = join(site, entry);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to, {
      recursive: true,
      filter: async (path) => {
        const name = basename(path);
        if (
          path !== from &&
          (excluded.has(name) ||
            name.startsWith(".env") ||
            /\.(?:pem|key|sqlite|db)(?:-|$)/i.test(name))
        )
          return false;
        if ((await lstat(path)).isSymbolicLink())
          throw new Error(`Source snapshot отклонил symlink: ${entry}/${name}`);
        return true;
      },
    });
  }
  // Shared сторонние dependencies сохраняются; workspace exports должны вести в snapshot,
  // иначе tsc/Next одновременно загружают исходные и скопированные @realize/* owners.
  const dependencies = join(site, "node_modules");
  await mkdir(dependencies);
  for (const entry of await readdir(join(root, "node_modules"))) {
    if (entry === "@realize") continue;
    await symlink(join(root, "node_modules", entry), join(dependencies, entry));
  }
  const workspaceScope = join(dependencies, "@realize");
  await mkdir(workspaceScope);
  const canonicalRoot = await realpath(root);
  for (const entry of await readdir(join(root, "node_modules/@realize"))) {
    const installed = join(root, "node_modules/@realize", entry);
    const target = await realpath(installed);
    const local = relative(canonicalRoot, target);
    await symlink(
      local.startsWith("packages/") ? join(site, local) : installed,
      join(workspaceScope, entry),
      "dir",
    );
  }
  // Shared syntax engine использует собственную установленную TypeScript dependency.
  await symlink(
    join(root, ".ai/tools/agent-search/node_modules"),
    join(site, ".ai/tools/agent-search/node_modules"),
    "dir",
  );
  // Production candidate использует actual health/build identity и не содержит fixture API.
  if (!readinessMarker) return { site };
  // Readiness доказывает принадлежность слушателя этому snapshot, даже при гонке за свободный порт.
  const identity = randomBytes(16).toString("hex");
  const marker = join(site, "src/app/(app)/api/search-acceptance/route.ts");
  await mkdir(dirname(marker), { recursive: true });
  await writeFile(
    marker,
    `// Generated disposable readiness marker.\nexport function GET() { return Response.json({ fixture: ${JSON.stringify(identity)} }); }\n`,
    { flag: "wx" },
  );
  return { site, identity };
}
