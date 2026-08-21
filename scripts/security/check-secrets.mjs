/**
 * @file scripts/security/check-secrets.mjs
 * @version 2026-08-17
 * @description Rejects common private-key and provider-token signatures in versionable files.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const signatures = [
  ["private-key", /-----BEGIN (?:OPENSSH|RSA|EC|DSA|PGP) PRIVATE KEY-----/],
  ["openai-api-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["github-token", /\bgh[oprsu]_[A-Za-z0-9]{30,}\b/],
  ["stripe-live-secret", /\bsk_live_[A-Za-z0-9]{16,}\b/],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
];

const candidateFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const findings = [];

for (const file of candidateFiles) {
  let content;

  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  if (content.includes("\0")) continue;

  for (const [name, signature] of signatures) {
    if (signature.test(content)) findings.push(`${file}: ${name}`);
  }
}

if (findings.length > 0) {
  console.error("[secrets] Potential secrets detected:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`[secrets] Checked ${candidateFiles.length} versionable files.`);
