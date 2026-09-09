/**
 * @file .ai/tools/git-delivery/src/network/createGitPushHook.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Ограждает push точным advertised ref/OID и сохраняет настроенный pre-push hook.
 */

import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Git } from "../Git.adapter.ts";
import { GitFailure } from "../GitFailure.error.ts";
import type { GitNetworkExpected } from "./GitNetwork.types.ts";

/** Источник — полный OID в refspec; hook не разрешает дополнительные refs или изменившийся remote OID. */
export async function createGitPushHook(
  git: Git,
  directory: string,
  expected: GitNetworkExpected,
): Promise<string> {
  const output = await git.run([
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "hooks/pre-push",
  ]);
  const configured = output.endsWith("\n") ? output.slice(0, -1) : output;
  if (!configured.startsWith("/") || /[\0\r\n]/.test(configured)) {
    throw new GitFailure(
      "git_hook_configuration_invalid",
      "Не удалось определить настроенный pre-push hook.",
    );
  }
  let original: string | null = configured;
  try {
    await access(configured, constants.X_OK);
  } catch {
    original = null;
  }
  const hooks = join(directory, "hooks");
  await mkdir(hooks, { mode: 0o700 });
  const tuple =
    [
      expected.sourceOid,
      expected.sourceOid,
      `refs/heads/${expected.branch}`,
      expected.remoteOid ?? "0".repeat(expected.sourceOid.length),
    ].join(" ") + "\n";
  await writeFile(
    join(hooks, "pre-push"),
    `#!${process.execPath}
const { spawn } = require("node:child_process");
const expected = ${JSON.stringify(tuple)};
const original = ${JSON.stringify(original)};
const chunks = [];
let bytes = 0;
const timer = setTimeout(() => { process.exit(1); }, 30000);
process.stdin.on("error", () => { process.exit(1); });
process.stdin.on("data", chunk => {
  bytes += chunk.length;
  if (bytes > 65536) process.exit(1);
  chunks.push(chunk);
});
process.stdin.on("end", () => {
  clearTimeout(timer);
  const input = Buffer.concat(chunks);
  if (!input.equals(Buffer.from(expected))) { process.stderr.write("git_remote_guard_denied\\n"); process.exitCode = 1; return; }
  if (original === null) return;
  const env = {...process.env};
  delete env.REALIZE_GIT_HTTP_TOKEN;
  // Git передаёт -c через env; вложенные команды hook должны снова видеть configured hooks.
  env.GIT_CONFIG_PARAMETERS = "'core.fsmonitor=false'";
  const hook = spawn(original, process.argv.slice(2), {env, shell:false, stdio:["pipe", "inherit", "inherit"]});
  hook.on("error", () => { process.exitCode = 1; });
  hook.on("exit", code => { process.exitCode = code === 0 ? 0 : 1; });
  hook.stdin.on("error", () => { process.exitCode = 1; });
  hook.stdin.end(input);
});
`,
    { mode: 0o700, flag: "wx" },
  );
  return hooks;
}
