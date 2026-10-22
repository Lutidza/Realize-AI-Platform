/**
 * @file .ai/tools/git-delivery/test/fixtures/runInterruptedCommit.controller.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Прерывает отдельный тестовый процесс строго до или после Git staging.
 */
import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { sep } from "node:path";

import { Git } from "@realize/git-runtime";
import { runDelivery } from "../../src/handler.ts";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const { command, context, phase } = JSON.parse(
  Buffer.concat(chunks).toString(),
);
const root = await realpath(context.repositoryRoot);
assert.ok(
  root.startsWith(`${await realpath(tmpdir())}${sep}realize-git-handler-`),
);
assert.ok(["before-add", "after-add"].includes(phase));
const run = Git.prototype.run;

// Инъекция существует только в disposable child: основной test runner и исходники не меняются.
Git.prototype.run = async function (args, options) {
  const isStage = this.root === root && args[0] === "add";
  if (isStage && phase === "before-add") process.kill(process.pid, "SIGKILL");
  const value = await run.call(this, args, options);
  if (isStage && phase === "after-add") process.kill(process.pid, "SIGKILL");
  return value;
};

const result = await runDelivery(command, context);
process.stdout.write(JSON.stringify(result));
process.exitCode = 1;
