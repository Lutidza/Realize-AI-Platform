/**
 * @file .ai/tools/git-delivery/src/network/resolveGitSshProfile.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет доверенную карту SSH-профилей, права файлов и явный источник ключа.
 */

import { constants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { GitFailure } from "../GitFailure.error.ts";
import type { GitSshProfile } from "./GitNetwork.types.ts";

function invalid(): never {
  throw new GitFailure(
    "git_ssh_profile_invalid",
    "Недопустимый доверенный SSH-профиль.",
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Проверяет всю карту до выбора профиля; SSH не использует случайный agent или пользовательский config. */
export async function resolveGitSshProfile(
  profiles: unknown,
  reference: string,
): Promise<GitSshProfile> {
  if (!record(profiles) || !Object.hasOwn(profiles, reference)) invalid();
  for (const [key, value] of Object.entries(profiles)) {
    if (
      key.trim() !== key ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(key) ||
      !record(value) ||
      Object.keys(value).some(
        (name) =>
          !["knownHostsFile", "identityFile", "agentSocket"].includes(name),
      ) ||
      ![value.knownHostsFile, value.identityFile].every(
        (path) =>
          typeof path === "string" &&
          isAbsolute(path) &&
          !/[\0\r\n%~"\\]/.test(path),
      ) ||
      (value.agentSocket !== undefined &&
        (typeof value.agentSocket !== "string" ||
          !isAbsolute(value.agentSocket) ||
          /[\0\r\n%~"\\]/.test(value.agentSocket)))
    )
      invalid();
  }
  const profile = profiles[reference] as GitSshProfile;
  try {
    for (const path of [profile.knownHostsFile, profile.identityFile]) {
      const file = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const metadata = await file.stat();
        const privateKey =
          path === profile.identityFile && profile.agentSocket === undefined;
        if (
          !metadata.isFile() ||
          metadata.size === 0 ||
          metadata.size > 1024 * 1024 ||
          (metadata.uid !== process.getuid!() &&
            !(!privateKey && metadata.uid === 0)) ||
          (metadata.mode & (privateKey ? 0o077 : 0o022)) !== 0
        )
          invalid();
        if (
          path === profile.identityFile &&
          profile.agentSocket !== undefined
        ) {
          const bytes = Buffer.alloc(1024 * 1024 + 1);
          const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
          if (bytesRead > 1024 * 1024) invalid();
          const publicKey = new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(0, bytesRead),
          );
          if (
            !/^(?:ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)|sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com) [A-Za-z0-9+/]+=*(?: [^\r\n]*)?\r?\n?$/.test(
              publicKey,
            )
          )
            invalid();
        }
      } finally {
        await file.close();
      }
    }
    if (profile.agentSocket !== undefined) {
      const socket = await lstat(profile.agentSocket);
      if (!socket.isSocket() || socket.uid !== process.getuid!()) invalid();
    }
  } catch {
    invalid();
  }
  return { ...profile };
}
