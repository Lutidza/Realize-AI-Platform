/**
 * @file packages/verification-runtime/src/readVerificationRuntime.adapter.ts
 * @version 1.3.2
 * @date 2026-11-07
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
  VerificationOptions,
  VerificationRuntime,
} from "./Verification.types.ts";
import { hashVerificationValue } from "./hashVerificationRecipe.util.ts";
import { readVerificationDependencySnapshot } from "./hashVerificationDependencies.adapter.ts";
import { measureVerificationMeasurement } from "./verificationMeasurement.util.ts";

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
    // Bounded 4 MiB buffer сокращает ожидание reads рядом с metadata I/O; exact bytes и stat сохраняются.
    for await (const bytes of createReadStream(path, {
      highWaterMark: 4 * 1024 * 1024,
    }))
      hash.update(bytes);
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
  options?: VerificationOptions,
): Promise<VerificationRuntime> {
  const expected = await measureVerificationMeasurement(
    options,
    "runtime_manifest_validation",
    async () => {
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
        return { node, npm };
      } catch {
        throw new PolicyError(
          "verification_runtime_manifest_invalid",
          "Корневой package.json должен задавать точные согласованные engines.node, engines.npm и packageManager.",
        );
      }
    },
  );
  if (process.versions.node !== expected.node)
    throw new PolicyError(
      "verification_node_version_mismatch",
      `Нужен Node.js ${expected.node}; запущен ${process.versions.node}. Выберите проектный runtime и перезапустите IDE или worker.`,
    );
  const executable = await measureVerificationMeasurement(
    options,
    "runtime_node_executable_resolution",
    () => realpath(process.execPath),
  );
  const prefix: string[] = [];
  if (check.command[0] === "npm") {
    const npm = await measureVerificationMeasurement(
      options,
      "runtime_npm_resolution_and_manifest_validation",
      async () => {
        let selected: string | undefined;
        for (const candidate of [
          resolve(
            dirname(executable),
            "../lib/node_modules/npm/bin/npm-cli.js",
          ),
          ...(environment.PATH ?? "")
            .split(delimiter)
            .map((directory) => resolve(directory, "npm")),
        ]) {
          try {
            const path = await realpath(candidate);
            if (basename(path) === "npm-cli.js") {
              selected = path;
              break;
            }
          } catch {
            /* Следующее явно разрешённое расположение npm. */
          }
        }
        if (!selected)
          throw new PolicyError(
            "verification_executable_missing",
            "Node npm-cli.js недоступен.",
          );
        // Поддерживаемая раскладка гарантирует, что inventory охватит npm/lib и bundled modules.
        if (
          basename(dirname(selected)) !== "bin" ||
          basename(dirname(dirname(selected))) !== "npm" ||
          basename(dirname(dirname(dirname(selected)))) !== "node_modules"
        )
          throw new PolicyError(
            "verification_executable_invalid",
            "Раскладка npm не позволяет подтвердить всё установленное дерево.",
          );
        // Читаем версию выбранного npm из его пакета: status не запускает даже npm --version.
        let npmVersion;
        try {
          npmVersion = JSON.parse(
            await readFile(
              resolve(dirname(selected), "../package.json"),
              "utf8",
            ),
          ).version;
          if (
            typeof npmVersion !== "string" ||
            !/^\d+\.\d+\.\d+$/.test(npmVersion)
          )
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
        return selected;
      },
    );
    prefix.push(npm);
  }
  // npm-cli.js делегирует запуск соседним lib/modules; их установленное дерево тоже является runtime input.
  // Его metadata и executable identity независимы; все reads завершаются и на пути отказа.
  const [identityRead, dependencyRead] = await Promise.allSettled([
    Promise.allSettled([
      measureVerificationMeasurement(
        options,
        "runtime_node_executable_identity_hash",
        () => executableIdentity(executable),
      ),
      ...prefix.map((path) =>
        measureVerificationMeasurement(
          options,
          "runtime_npm_cli_identity_hash",
          () => executableIdentity(path),
        ),
      ),
    ]),
    prefix[0]
      ? await measureVerificationMeasurement(
          options,
          "runtime_npm_dependency_metadata_inventory",
          () =>
            readVerificationDependencySnapshot(
              resolve(dirname(prefix[0]), "../../.."),
            ),
          (snapshot) => ({
            entries: snapshot.entries,
            bytes: snapshot.bytes,
          }),
        ).then((snapshot) => snapshot.digest)
      : Promise.resolve(null),
  ]);
  if (identityRead.status === "rejected") throw identityRead.reason;
  const identities = identityRead.value.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
  if (dependencyRead.status === "rejected") throw dependencyRead.reason;
  const npmDependencies = dependencyRead.value;
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
