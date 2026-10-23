/**
 * @file packages/verification-runtime/src/readVerificationRuntime.adapter.ts
 * @version 1.1.0
 * @date 2026-10-22
 * @description Привязывает проверку к текущему Node и npm executable, а не к произвольному shell launcher.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
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
  check: VerificationCheck,
  environment: NodeJS.ProcessEnv,
): Promise<VerificationRuntime> {
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
      version: process.version,
      versions: process.versions,
      platform: process.platform,
      arch: process.arch,
    }),
  };
}
