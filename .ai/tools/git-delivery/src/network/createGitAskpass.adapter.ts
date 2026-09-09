/**
 * @file .ai/tools/git-delivery/src/network/createGitAskpass.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Создаёт временный askpass, читающий HTTPS token только из окружения дочернего Git.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Файл содержит только протокол askpass; token не записывается на диск. */
export async function createGitAskpass(directory: string): Promise<string> {
  const path = join(directory, "askpass.cjs");
  await writeFile(
    path,
    `#!${process.execPath}
const prompt = process.argv[2] || "";
if (prompt.startsWith("Username for 'https://") && prompt.endsWith("': ")) {
  process.stdout.write("x-access-token\\n");
} else if (prompt.startsWith("Password for 'https://x-access-token@") && prompt.endsWith("': ") && process.env.REALIZE_GIT_HTTP_TOKEN) {
  process.stdout.write(process.env.REALIZE_GIT_HTTP_TOKEN + "\\n");
} else { process.exitCode = 1; }
`,
    { mode: 0o700, flag: "wx" },
  );
  return path;
}
