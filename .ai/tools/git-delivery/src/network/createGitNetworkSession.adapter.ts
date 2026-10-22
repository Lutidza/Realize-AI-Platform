/**
 * @file .ai/tools/git-delivery/src/network/createGitNetworkSession.adapter.ts
 * @version 1.1.1
 * @date 2026-10-22
 * @description Создаёт ограниченную HTTPS/SSH сессию чтения, адресного fetch и non-force push в канонический GitHub remote.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitFailure } from "@realize/git-runtime";
import type { GitNetworkEnvironment } from "@realize/git-runtime";
import type {
  GitNetworkOptions,
  GitFetchNetworkSession,
} from "./GitNetwork.types.ts";
import { assertGitNetworkConfiguration } from "@realize/git-runtime";
import { createGitAskpass } from "@realize/git-runtime";
import { createGitPushHook } from "./createGitPushHook.adapter.ts";
import { createGitSshCommand } from "./createGitSshCommand.adapter.ts";
import { resolveGitSshProfile } from "./resolveGitSshProfile.adapter.ts";

/** Авторизация приходит только из trusted server DTO; URL модели и произвольные transport env не принимаются. */
export async function createGitNetworkSession(
  options: GitNetworkOptions,
): Promise<GitFetchNetworkSession> {
  const { git } = options;
  const connection = { ...options.connection };
  const expected = { ...options.expected };
  if (
    !connection ||
    connection.state !== "ready" ||
    connection.connectionKey !== "github:primary" ||
    !Number.isSafeInteger(connection.revision) ||
    connection.revision < 1 ||
    typeof connection.repositorySlug !== "string" ||
    connection.repositorySlug.trim() !== connection.repositorySlug ||
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(
      connection.repositorySlug,
    ) ||
    connection.repositorySlug.split("/")[1] === "." ||
    connection.repositorySlug.split("/")[1] === ".." ||
    !["https", "ssh"].includes(connection.transport) ||
    !expected ||
    typeof expected.branch !== "string" ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(expected.sourceOid) ||
    ![40, 64].includes(expected.sourceOid.length) ||
    /^0+$/.test(expected.sourceOid) ||
    (expected.remoteOid !== null &&
      (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(expected.remoteOid) ||
        expected.remoteOid.length !== expected.sourceOid.length))
  ) {
    throw new GitFailure(
      "git_network_connection_invalid",
      "Недопустимое сетевое подключение Git.",
    );
  }
  const https = `https://github.com/${connection.repositorySlug}.git`;
  const ssh = `ssh://git@github.com/${connection.repositorySlug}.git`;
  if (
    ![
      https,
      https.slice(0, -4),
      ssh,
      ssh.slice(0, -4),
      `git@github.com:${connection.repositorySlug}.git`,
    ].includes(connection.repositoryURL) ||
    (connection.transport === "https" &&
      (typeof connection.token !== "string" ||
        !connection.token ||
        Buffer.byteLength(connection.token) > 32768 ||
        /[\0\r\n]/.test(connection.token))) ||
    (connection.transport === "ssh" &&
      typeof connection.sshProfileRef !== "string")
  ) {
    throw new GitFailure(
      "git_network_connection_invalid",
      "Недопустимое сетевое подключение Git.",
    );
  }
  const ref = `refs/heads/${expected.branch}`;
  await git.run(["check-ref-format", ref]);
  await assertGitNetworkConfiguration(git, connection.transport);
  const directory = await mkdtemp(join(tmpdir(), "realize-git-network-"));
  try {
    const network: GitNetworkEnvironment =
      connection.transport === "https"
        ? {
            transport: "https",
            token: connection.token,
            askpassPath: await createGitAskpass(directory),
          }
        : {
            transport: "ssh",
            sshPath: await createGitSshCommand(
              directory,
              await resolveGitSshProfile(
                options.sshProfiles,
                connection.sshProfileRef,
              ),
            ),
          };
    const remote = connection.transport === "https" ? https : ssh;
    let closed = false;
    let closePromise: Promise<void> | undefined;
    const active = new Set<Promise<unknown>>();
    const execute = <T>(operation: () => Promise<T>): Promise<T> => {
      if (closed)
        return Promise.reject(
          new GitFailure("git_network_closed", "Сетевая сессия Git закрыта."),
        );
      const pending = operation().catch((error: unknown) => {
        if (error instanceof GitFailure) throw error;
        throw new GitFailure(
          "git_network_operation_failed",
          "Не удалось выполнить сетевую операцию Git.",
        );
      });
      active.add(pending);
      void pending
        .finally(() => {
          active.delete(pending);
        })
        .catch(() => {});
      return pending;
    };
    let pushed = false;
    let fetched = false;
    return {
      readRemoteHead: () =>
        execute(async () => {
          await assertGitNetworkConfiguration(git, connection.transport);
          let output: string;
          try {
            output = await git.run(
              ["ls-remote", "--refs", "--exit-code", remote, ref],
              { network },
            );
          } catch (error) {
            if (
              error instanceof GitFailure &&
              error.code === "git_command_failed" &&
              error.exitCode === 2
            )
              return null;
            throw error;
          }
          const match = /^([0-9a-f]{40}|[0-9a-f]{64})\t([^\r\n]+)\n$/.exec(
            output,
          );
          if (
            !match ||
            match[2] !== ref ||
            match[1]!.length !== expected.sourceOid.length
          )
            throw new GitFailure(
              "git_remote_output_invalid",
              "Ответ remote не соответствует разрешённой ветке.",
            );
          return match[1]!;
        }),
      fetch: (trackingRef, previousOid) =>
        execute(async () => {
          if (fetched)
            throw new GitFailure(
              "git_fetch_already_attempted",
              "Fetch уже был запущен в этой сессии.",
            );
          if (
            typeof trackingRef !== "string" ||
            trackingRef !== `refs/remotes/realize-sync/${expected.branch}` ||
            expected.remoteOid === null ||
            (previousOid !== null &&
              (typeof previousOid !== "string" ||
                !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(previousOid) ||
                previousOid.length !== expected.sourceOid.length ||
                /^0+$/.test(previousOid)))
          )
            throw new GitFailure(
              "git_fetch_target_invalid",
              "Fetch требует назначенную ветку и служебный tracking ref.",
            );
          await git.run(["check-ref-format", trackingRef]);
          fetched = true;
          await assertGitNetworkConfiguration(git, connection.transport);
          // Точный OID исключает configured fetch mappings, tags, submodules и общий FETCH_HEAD.
          await git.run(
            [
              "-c",
              "core.hooksPath=/dev/null",
              "-c",
              "fetch.prune=false",
              "-c",
              "fetch.pruneTags=false",
              "-c",
              "fetch.writeCommitGraph=false",
              "-c",
              "submodule.recurse=false",
              "fetch",
              "--no-tags",
              "--no-prune",
              "--no-write-fetch-head",
              "--no-recurse-submodules",
              "--no-auto-maintenance",
              "--no-show-forced-updates",
              "--refmap=",
              "--",
              remote,
              expected.remoteOid,
            ],
            { network },
          );
          const objectType = (
            await git.run(["cat-file", "-t", expected.remoteOid], {
              machineRead: true,
            })
          ).trim();
          if (objectType !== "commit")
            throw new GitFailure(
              "git_fetch_object_invalid",
              "Назначенный fetch OID не является commit.",
            );
          // CAS защищает ранее наблюдённый ref: fetch не получает права перезаписать новое чужое значение.
          await git.run([
            "update-ref",
            trackingRef,
            expected.remoteOid,
            previousOid ?? "0".repeat(expected.sourceOid.length),
          ]);
        }),
      push: () =>
        execute(async () => {
          if (pushed)
            throw new GitFailure(
              "git_push_already_attempted",
              "Push уже был запущен в этой сессии.",
            );
          pushed = true;
          await assertGitNetworkConfiguration(git, connection.transport);
          const hooks = await createGitPushHook(git, directory, expected);
          await git.run(
            [
              "-c",
              `core.hooksPath=${hooks}`,
              "push",
              "--porcelain",
              "--no-force",
              "--no-follow-tags",
              "--recurse-submodules=no",
              "--",
              remote,
              `${expected.sourceOid}:${ref}`,
            ],
            { network },
          );
        }),
      close: () => {
        if (!closePromise) {
          closed = true;
          closePromise = Promise.allSettled([...active]).then(async () => {
            await rm(directory, { recursive: true, force: true });
          });
        }
        return closePromise;
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    if (error instanceof GitFailure) throw error;
    throw new GitFailure(
      "git_network_setup_failed",
      "Не удалось подготовить сетевую сессию Git.",
    );
  }
}
