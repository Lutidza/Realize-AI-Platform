/**
 * @file scripts/release/publishSystemAIRelease.service.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Публикует детерминированный system AI artifact из явных owner sources.
 */
import { lstat, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import type { SystemAIRelease } from "../../packages/ai-contracts/src/SystemAIRelease.types";
import { hashCanonicalJSON } from "../../packages/change-engine/src/canonicalJson";
import {
  SYSTEM_CAPABILITY_SOURCES,
  SYSTEM_CHECK_IDS,
} from "../../packages/change-engine/src/system-ai/systemCapabilities.config";
import source from "../../packages/change-engine/src/system-ai/systemAIRelease.source.json";

export const SYSTEM_AI_ARTIFACT_PATH = `packages/change-engine/src/system-ai/releases/${source.releaseID}.generated.json`;

/** Источники читаются только при owner publication; runtime не читает checkout. */
export const publishSystemAIRelease = async (
  root: string,
): Promise<SystemAIRelease> => {
  if (
    !/^\d+\.\d+\.\d+$/.test(source.version) ||
    source.releaseID !== `realize-system-${source.version}`
  )
    throw new Error("System AI release ID must match its explicit version.");
  const read = async (path: string) => {
    if (
      !/^(?:\.ai\/rules\/runtime\/|packages\/|services\/)/.test(path) ||
      path.split("/").some((part) => !part || part === "." || part === "..") ||
      /(?:^|\/)\.env|\.(?:pem|key)$/.test(path)
    )
      throw new Error("System AI publication source is not allowed.");
    let current = resolve(root);
    for (const part of path.split("/")) {
      current = resolve(current, part);
      const stats = await lstat(current);
      if (stats.isSymbolicLink())
        throw new Error("System AI source must not be a symlink.");
    }
    const stats = await lstat(current);
    if (
      !stats.isFile() ||
      stats.size > 256 * 1024 ||
      relative(resolve(root), current).startsWith("..")
    )
      throw new Error("System AI publication source is invalid or too large.");
    const bytes = await readFile(current);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return {
      path,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
      text,
    };
  };
  const instructions = await Promise.all(
    source.instructions.map(async (entry) => ({
      id: entry.id,
      ...(await read(entry.path)),
    })),
  );
  const paths = [
    ...new Set([
      ...source.sources,
      "packages/change-engine/src/system-ai/systemAIRelease.source.json",
      "packages/change-engine/src/system-ai/systemCapabilities.config.ts",
    ]),
  ].sort();
  const sources = await Promise.all(
    paths.map(async (path) => {
      const value = await read(path);
      return { path, contentHash: value.contentHash };
    }),
  );
  const payload = {
    schemaVersion: "1.0" as const,
    releaseID: source.releaseID,
    version: source.version,
    projectProfile: source.projectProfile,
    capabilities: SYSTEM_CAPABILITY_SOURCES,
    checkIDs: SYSTEM_CHECK_IDS,
    instructions,
    sources,
    execution: source.execution,
  };
  return { ...payload, manifestHash: hashCanonicalJSON(payload) };
};
