/**
 * @file .ai/tools/engineering/test/filesystemCrash.worker.ts
 * @version 1.2.0
 * @date 2026-10-29
 * @description Прерывает native mutation до syscall либо после него перед journal confirmation.
 * @see documentation/architecture/engineering-operations.md
 */
import { readFileSync } from "node:fs";
import { filesystemFixture } from "./filesystemIntegration.fixture.ts";
const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
const f = filesystemFixture(
  input.native,
  input.root,
  undefined,
  [],
  input.movePolicy,
  input.extraFolderPolicies,
  input.sourceKinds,
);
f.control.crashAtWrite = input.atWrite ?? 0;
f.control.crash = input.phase !== "before";
f.control.crashBeforeWrite = input.phase === "before";
await f.runtime.apply(input.command);
throw Error("Expected SIGKILL after native publication");
