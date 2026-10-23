/**
 * @file packages/verification-runtime/src/readVerificationRuntime.adapter.ts
 * @version 1.2.0
 * @date 2026-10-23
 * @description Проверяет проектные версии Node/npm и связывает выбранные executable с evidence.
 * @see documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, resolve, delimiter, basename } from "node:path";
import { PolicyError } from "@realize/git-runtime";
import type {
  VerificationCheck,
  VerificationRuntime,
} from "./Verification.types.ts";
import { hashVerificationValue } from "./hashVerificationRecipe.util.ts";
import { hashVerificationDependencies } from "./hashVerificationDependencies.adapter.ts";

const cache = new Map<string, string>();
async function executableIdentity(path: string): Promise<string> {
  const before = await stat(path, { bigint: true });
  if (
    !before.isFile() ||
    before.size > BigInt(256) * BigInt(1024) * BigInt(1024)
  )
    throw new PolicyError(
      "verification_executable_invalid",
      "Executable проверки недопустим.",
    );
  const identity = hashVerificationValue([
    path,
    before.dev.toString(),
    before.ino.toString(),
    before.size.toString(),
    before.mode.toString(),
    before.mtimeNs.toString(),
    before.ctimeNs.toString(),
  ]);
  let digest = cache.get(identity);
  if (!digest) {
    const hash = createHash("sha256");
    for await (const bytes of createReadStream(path)) hash.update(bytes);
    digest = hash.digest("hex");
    if (cache.size > 16) cache.clear();
    cache.set(identity, digest);
  }
  const after = await stat(path, { bigint: true });
  if (
    before.ino !== after.ino ||
    before.dev !== after.dev ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs ||
    before.size !== after.size
  )
    throw new PolicyError(
      "verification_executable_changed",
      "Executable проверки изменился.",
    );
  return hashVerificationValue([identity, digest]);
}

export async function readVerificationRuntime(
  root: string,
  check: VerificationCheck,
  environment: NodeJS.ProcessEnv,
): Promise<VerificationRuntime> {
  let expected;
  try {
    const manifest = JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8"),
    );
    const { node, npm } = manifest.engines ?? {};
    if (
      typeof node !== "string" ||
      typeof npm !== "string" ||
      !/^\d+\.\d+\.\d+$/.test(node) ||
      !/^\d+\.\d+\.\d+$/.test(npm) ||
      manifest.packageManager !== `npm@${npm}`
    )
      throw new Error("invalid runtime pins");
    expected = { node, npm };
  } catch {
    throw new PolicyError(
      "verification_runtime_manifest_invalid",
      "Корневой package.json должен задавать точные согласованные engines.node, engines.npm и packageManager.",
    );
  }
  if (process.versions.node !== expected.node)
    throw new PolicyError(
      "verification_node_version_mismatch",
      `Нужен Node.js ${expected.node}; запущен ${process.versions.node}. Выберите проектный runtime и перезапустите IDE или worker.`,
    );
  const executable = await realpath(process.execPath);
  const prefix: string[] = [];
  if (check.command[0] === "npm") {
    let npm: string | undefined;
    for (const candidate of [
      resolve(dirname(executable), "../lib/node_modules/npm/bin/npm-cli.js"),
      ...(environment.PATH ?? "")
        .split(delimiter)
        .map((directory) => resolve(directory, "npm")),
    ]) {
      try {
        const path = await realpath(candidate);
        if (basename(path) === "npm-cli.js") {
          npm = path;
          break;
        }
      } catch {
        /* Следующее явно разрешённое расположение npm. */
      }
    }
    if (!npm)
      throw new PolicyError(
        "verification_executable_missing",
        "Node npm-cli.js недоступен.",
      );
    // Поддерживаемая раскладка гарантирует, что inventory охватит npm/lib и bundled modules.
    if (
      basename(dirname(npm)) !== "bin" ||
      basename(dirname(dirname(npm))) !== "npm" ||
      basename(dirname(dirname(dirname(npm)))) !== "node_modules"
    )
      throw new PolicyError(
        "verification_executable_invalid",
        "Раскладка npm не позволяет подтвердить всё установленное дерево.",
      );
    // Читаем версию выбранного npm из его пакета: status не запускает даже npm --version.
    let npmVersion;
    try {
      npmVersion = JSON.parse(
        await readFile(resolve(dirname(npm), "../package.json"), "utf8"),
      ).version;
      if (typeof npmVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(npmVersion))
        throw new Error("invalid npm version");
    } catch {
      throw new PolicyError(
        "verification_runtime_manifest_invalid",
        "package.json выбранного npm должен содержать точную version.",
      );
    }
    if (npmVersion !== expected.npm)
      throw new PolicyError(
        "verification_npm_version_mismatch",
        `Нужен npm ${expected.npm}; выбран ${npmVersion}. Выберите проектный runtime и перезапустите IDE или worker.`,
      );
    prefix.push(npm);
  }
  const identities = await Promise.all(
    [executable, ...prefix].map(executableIdentity),
  );
  // npm-cli.js делегирует запуск соседним lib/modules; их установленное дерево тоже является runtime input.
  const npmDependencies = prefix[0]
    ? await hashVerificationDependencies(
        resolve(dirname(prefix[0]), "../../.."),
      )
    : null;
  return {
    executable,
    prefix,
    digest: hashVerificationValue({
      executable,
      prefix,
      identities,
      npmDependencies,
      expected,
      version: process.version,
      versions: process.versions,
      platform: process.platform,
      arch: process.arch,
    }),
  };
}
