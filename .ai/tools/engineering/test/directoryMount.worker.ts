/**
 * @file .ai/tools/engineering/test/directoryMount.worker.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет отказ directory move с настоящим чужим mount в отдельном user/mount namespace.
 * @see documentation/architecture/engineering-operations.md
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { filesystemFixture } from "./filesystemIntegration.fixture.ts";

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
const target = join(input.root, "checkout", input.mountPath);
// Этот worker запускается только через unshare: host mount namespace не меняется.
execFileSync("mount", [
  "-t",
  "tmpfs",
  "-o",
  "size=1m,nosuid,nodev",
  "tmpfs",
  target,
]);
let fixture: ReturnType<typeof filesystemFixture> | undefined;
try {
  fixture = filesystemFixture(
    input.native,
    input.root,
    undefined,
    [],
    input.movePolicy,
  );
  const differentDevice =
    statSync(target).dev !== statSync(fixture.checkout).dev;
  const result = await fixture.runtime.plan(input.command);
  console.log(
    JSON.stringify({ differentDevice, result, writes: fixture.control.writes }),
  );
} finally {
  fixture?.close();
  execFileSync("umount", [target]);
}
