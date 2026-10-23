/**
 * @file packages/verification-runtime/src/assertVerificationOwner.adapter.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Подтверждает поддерживаемую раскладку серверных packages перед привязкой executing owner к исходникам.
 */
import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PolicyError } from "@realize/git-runtime";

/** Bundled layout без доступного исполняемого source owner не создаёт reusable evidence. */
export async function assertVerificationOwner(root: string): Promise<void> {
  try {
    if ((await realpath(root)) !== root) throw new Error();
    const required = [
      "packages/verification-runtime/package.json",
      "packages/verification-runtime/src/verificationRuntime.server.index.ts",
      "packages/verification-runtime/src/assertVerificationOwner.adapter.ts",
      "packages/git-runtime/package.json",
      "packages/git-runtime/src/gitRuntime.server.index.ts",
    ];
    for (const relative of required) {
      const path = join(root, relative);
      if (!(await lstat(path)).isFile() || (await realpath(path)) !== path)
        throw new Error();
    }
    if (
      (await realpath(fileURLToPath(import.meta.url))) !==
        join(root, required[2]) ||
      (await realpath(
        fileURLToPath(import.meta.resolve("@realize/git-runtime")),
      )) !== join(root, required[4])
    )
      throw new Error();
    const manifest = JSON.parse(
      await readFile(join(root, required[0]), "utf8"),
    );
    if (
      manifest.name !== "@realize/verification-runtime" ||
      manifest.exports?.["."] !== "./src/verificationRuntime.server.index.ts"
    )
      throw new Error();
  } catch {
    throw new PolicyError(
      "verification_owner_unavailable",
      "Исполняемый owner проверок не соответствует поддерживаемой серверной раскладке packages.",
    );
  }
}
