/**
 * @file scripts/release/create-release-manifest.mjs
 * @version 2026-08-17
 * @description Creates the immutable release handoff consumed by deployment jobs.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const required = ["GIT_SHA", "IMAGE_DIGEST", "IMAGE_REPOSITORY", "RELEASE_ID"];

for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

if (!/^sha256:[a-f0-9]{64}$/.test(process.env.IMAGE_DIGEST)) {
  throw new Error("IMAGE_DIGEST must be a sha256 digest");
}

if (!/^[a-f0-9]{40}$/.test(process.env.GIT_SHA)) {
  throw new Error("GIT_SHA must be a full commit SHA");
}

const outputPath = resolve(
  process.argv[2] || "artifacts/release-manifest.json",
);
const manifest = {
  createdAt: new Date().toISOString(),
  gitSha: process.env.GIT_SHA,
  image: `${process.env.IMAGE_REPOSITORY}@${process.env.IMAGE_DIGEST}`,
  imageDigest: process.env.IMAGE_DIGEST,
  releaseId: process.env.RELEASE_ID,
  schemaVersion: 1,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  mode: 0o640,
});
console.log(`[release] Wrote ${outputPath}`);
