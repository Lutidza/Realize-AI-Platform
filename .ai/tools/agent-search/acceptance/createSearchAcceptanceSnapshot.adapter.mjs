/**
 * @file .ai/tools/agent-search/acceptance/createSearchAcceptanceSnapshot.adapter.mjs
 * @version 1.0.0
 * @date 2026-09-29
 * @description Создаёт disposable source snapshot для Next: генерация и cache не затрагивают рабочий checkout.
 * @see documentation/architecture/repository-search.md
 */
import { cp, lstat, mkdir, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/** Включены только исходники и необходимые статические assets; .env, runtime, uploads и установленные зависимости не копируются. */
export async function createSearchAcceptanceSnapshot(root, directory) {
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
    ".ai/tools/agent-search/src",
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
  await symlink(join(root, "node_modules"), join(site, "node_modules"), "dir");
  // Shared syntax engine использует собственную установленную TypeScript dependency.
  await symlink(
    join(root, ".ai/tools/agent-search/node_modules"),
    join(site, ".ai/tools/agent-search/node_modules"),
    "dir",
  );
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
