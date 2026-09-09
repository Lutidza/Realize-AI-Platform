/**
 * @file .ai/tools/git-delivery/src/network/createGitSshCommand.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Создаёт SSH wrapper с обязательной проверкой хоста и единственной разрешённой identity.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitSshProfile } from "./GitNetwork.types.ts";

/** Git вызывает executable напрямую через GIT_SSH; profile не превращается в shell-команду. */
export async function createGitSshCommand(
  directory: string,
  profile: GitSshProfile,
): Promise<string> {
  const path = join(directory, "ssh.cjs");
  const options = [
    "-F",
    "/dev/null",
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    `UserKnownHostsFile=${JSON.stringify(profile.knownHostsFile)}`,
    "-o",
    "GlobalKnownHostsFile=/dev/null",
    "-o",
    "UpdateHostKeys=no",
    "-o",
    "VerifyHostKeyDNS=no",
    "-o",
    "KnownHostsCommand=none",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    `IdentityFile=${JSON.stringify(profile.identityFile)}`,
    "-o",
    `IdentityAgent=${profile.agentSocket === undefined ? "none" : JSON.stringify(profile.agentSocket)}`,
    "-o",
    "CertificateFile=none",
    "-o",
    "PreferredAuthentications=publickey",
    "-o",
    "PasswordAuthentication=no",
    "-o",
    "KbdInteractiveAuthentication=no",
    "-o",
    "ControlMaster=no",
    "-o",
    "ControlPath=none",
    "-o",
    "ControlPersist=no",
    "-o",
    "ProxyCommand=none",
    "-o",
    "ProxyJump=none",
    "-o",
    "ForwardAgent=no",
    "-o",
    "ConnectTimeout=15",
    "-o",
    "ConnectionAttempts=1",
    "-o",
    "LogLevel=ERROR",
  ];
  await writeFile(
    path,
    `#!${process.execPath}
const { spawn } = require("node:child_process");
const child = spawn("/usr/bin/ssh", [...${JSON.stringify(options)}, ...process.argv.slice(2)], {shell:false, stdio:"inherit"});
child.on("error", () => { process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code === 0 ? 0 : 1; });
`,
    { mode: 0o700, flag: "wx" },
  );
  return path;
}
