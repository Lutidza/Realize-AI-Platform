/**
 * @file scripts/runtime/verify-runtime.mjs
 * @version 2026-08-17
 * @description Enforces the exact runtime pair used by local tooling, Docker and CI.
 */

const expectedNode = "24.18.0";
const expectedNpm = "11.15.0";
const actualNode = process.versions.node;
const actualNpm =
  process.env.npm_config_user_agent?.match(/npm\/([^\s]+)/)?.[1];

const failures = [];

if (actualNode !== expectedNode) {
  failures.push(`Node.js ${expectedNode} is required; received ${actualNode}.`);
}

if (!actualNpm) {
  failures.push(
    "Run this check through npm so the npm version can be verified.",
  );
} else if (actualNpm !== expectedNpm) {
  failures.push(`npm ${expectedNpm} is required; received ${actualNpm}.`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[runtime] ${failure}`);
  }

  process.exit(1);
}

console.log(`[runtime] Node.js ${actualNode}; npm ${actualNpm}`);
