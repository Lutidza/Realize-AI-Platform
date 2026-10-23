/**
 * @file scripts/runtime/readProjectRuntime.config.mjs
 * @version 1.0.0
 * @date 2026-10-23
 * @description Читает единственную закреплённую пару Node/npm из корневого package.json.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export function readProjectRuntime(root = projectRoot) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const { node, npm } = manifest.engines ?? {};
  if (
    !/^\d+\.\d+\.\d+$/.test(node ?? "") ||
    !/^\d+\.\d+\.\d+$/.test(npm ?? "") ||
    manifest.packageManager !== `npm@${npm}`
  ) {
    throw new Error(
      "package.json должен задавать точные согласованные engines.node, engines.npm и packageManager.",
    );
  }
  return { node, npm };
}
