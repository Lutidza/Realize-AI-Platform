/**
 * @file scripts/release/publishSystemAIRelease.controller.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Генерирует system AI artifact или обнаруживает неопубликованный drift.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { format, resolveConfig } from "prettier";
import {
  publishSystemAIRelease,
  SYSTEM_AI_ARTIFACT_PATH,
} from "./publishSystemAIRelease.service";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== "--check"))
  throw new Error("Usage: publishSystemAIRelease.controller.ts [--check]");
const release = await publishSystemAIRelease(process.cwd());
const output = resolve(SYSTEM_AI_ARTIFACT_PATH);
const text = await format(JSON.stringify(release), {
  ...(await resolveConfig(output)),
  parser: "json",
});
if (args[0] === "--check") {
  const existing = JSON.parse(await readFile(output, "utf8"));
  if (JSON.stringify(existing) !== JSON.stringify(release))
    throw new Error(
      "System AI release is stale. Publish the owner-reviewed sources before delivery.",
    );
} else {
  await mkdir(dirname(output), { recursive: true });
  let existing: unknown;
  try {
    existing = JSON.parse(await readFile(output, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (
    existing !== undefined &&
    JSON.stringify(existing) !== JSON.stringify(release)
  )
    throw new Error(
      "System AI release ID already exists with different content. Publish a new version and register it explicitly.",
    );
  if (existing === undefined)
    await writeFile(output, text, { mode: 0o644, flag: "wx" });
}
process.stdout.write(`${release.releaseID} ${release.manifestHash}\n`);
