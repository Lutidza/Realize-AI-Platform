/**
 * @file scripts/runtime/verifyProjectRuntimePins.service.mjs
 * @version 1.1.0
 * @date 2026-10-23
 * @description Проверяет согласованность копий проектных runtime pins в инструментах, CI и Docker.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function verifyProjectRuntimePins(root, expected) {
  const failures = [];
  const text = (path) => readFileSync(join(root, path), "utf8");
  const json = (path) => JSON.parse(text(path));
  const check = (condition, path) => {
    if (!condition)
      failures.push(
        `${path}: требуется Node ${expected.node}, npm ${expected.npm}.`,
      );
  };
  const dev = json("package.json").devEngines;
  check(
    dev?.runtime?.name === "node" &&
      dev.runtime.version === expected.node &&
      dev.runtime.onFail === "error" &&
      dev?.packageManager?.name === "npm" &&
      dev.packageManager.version === expected.npm &&
      dev.packageManager.onFail === "error",
    "package.json:devEngines",
  );
  for (const path of [".nvmrc", ".node-version"])
    check(text(path).trim() === expected.node, path);
  const manifestPaths = ["package.json"];
  // Проверяем собственные packages и agent tools; node_modules и сторонние engines не меняем.
  for (const base of ["packages", ".ai/tools"]) {
    for (const entry of readdirSync(join(root, base), {
      withFileTypes: true,
    })) {
      const path = `${base}/${entry.name}/package.json`;
      if (entry.isDirectory() && existsSync(join(root, path)))
        manifestPaths.push(path);
    }
  }
  for (const path of manifestPaths) {
    const manifest = json(path);
    const mustPin =
      path.startsWith(".ai/") ||
      manifest.engines?.node ||
      manifest.engines?.npm ||
      manifest.packageManager;
    if (!mustPin) continue;
    check(
      manifest.engines?.node === expected.node &&
        manifest.engines?.npm === expected.npm &&
        manifest.packageManager === `npm@${expected.npm}`,
      path,
    );
    const lockPath = path.replace("package.json", "package-lock.json");
    if (existsSync(join(root, lockPath))) {
      const lock = json(lockPath).packages?.[""];
      check(
        lock?.engines?.node === expected.node &&
          lock?.engines?.npm === expected.npm,
        lockPath,
      );
    }
  }
  const rootLock = json("package-lock.json");
  for (const [path, manifest] of Object.entries(rootLock.packages ?? {})) {
    if (
      path.startsWith("packages/") &&
      (manifest.engines?.node || manifest.engines?.npm)
    ) {
      check(
        manifest.engines.node === expected.node &&
          manifest.engines.npm === expected.npm,
        `package-lock.json:${path}`,
      );
    }
  }
  const docker = text("Dockerfile");
  check(
    docker.match(/^ARG NODE_IMAGE=node:([\d.]+)-/m)?.[1] === expected.node,
    "Dockerfile",
  );
  check(
    docker.match(/npm install --global npm@([\d.]+)/)?.[1] === expected.npm,
    "Dockerfile",
  );
  for (const entry of readdirSync(join(root, ".github/workflows"))) {
    if (!/\.ya?ml$/.test(entry)) continue;
    const path = `.github/workflows/${entry}`;
    const workflow = text(path);
    const nodes = [...workflow.matchAll(/node-version:\s*["']?([\d.]+)/g)];
    const npms = [...workflow.matchAll(/npm install --global npm@([\d.]+)/g)];
    if (!workflow.includes("actions/setup-node@")) continue;
    check(
      nodes.length > 0 && nodes.every((match) => match[1] === expected.node),
      path,
    );
    check(
      npms.length > 0 && npms.every((match) => match[1] === expected.npm),
      path,
    );
  }
  if (failures.length) throw new Error(failures.join("\n[runtime] "));
}
