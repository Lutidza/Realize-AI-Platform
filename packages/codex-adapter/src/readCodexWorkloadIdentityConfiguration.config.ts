/**
 * @file packages/codex-adapter/src/readCodexWorkloadIdentityConfiguration.config.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет серверную конфигурацию workload identity и защиту файла токена без чтения содержимого.
 * @see documentation/architecture/codex-integration.md
 */

import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Принимает только операторское окружение и файл вне cwd и рабочего checkout в каталоге 0700.
 * Файл принадлежит текущему UID, имеет права 0400 или 0600, не является symlink
 * и не имеет дополнительных hard link. Содержимое токена читает только Codex.
 * Ошибка готовности не раскрывает значения окружения, пути или системный cause.
 */
export const readCodexWorkloadIdentityConfiguration = async (
  sourceEnvironment: Partial<NodeJS.ProcessEnv> = process.env,
) => {
  try {
    const federationRuleID = sourceEnvironment.REALIZE_CODEX_FEDERATION_RULE_ID;
    const identityTokenFile =
      sourceEnvironment.REALIZE_CODEX_IDENTITY_TOKEN_FILE;
    if (
      !federationRuleID ||
      !/^[A-Za-z0-9_-]{1,256}$/.test(federationRuleID) ||
      federationRuleID.trim() !== federationRuleID ||
      !identityTokenFile ||
      identityTokenFile.includes("\0") ||
      !isAbsolute(identityTokenFile) ||
      resolve(identityTokenFile) !== identityTokenFile ||
      !process.getuid
    )
      throw new Error();

    const protectedDirectory = dirname(identityTokenFile);
    const [directory, canonicalDirectory, token, repositoryDirectories] =
      await Promise.all([
        lstat(protectedDirectory),
        realpath(protectedDirectory),
        lstat(identityTokenFile),
        Promise.all([
          realpath(process.cwd()),
          ...(sourceEnvironment.REALIZE_AI_WORKSPACE_ROOT
            ? [realpath(sourceEnvironment.REALIZE_AI_WORKSPACE_ROOT)]
            : []),
        ]),
      ]);
    const isInsideRepository = repositoryDirectories.some(
      (repositoryDirectory) => {
        const relativeTokenPath = relative(
          repositoryDirectory,
          identityTokenFile,
        );
        return (
          relativeTokenPath === "" ||
          (relativeTokenPath !== ".." &&
            !relativeTokenPath.startsWith(`..${sep}`) &&
            !isAbsolute(relativeTokenPath))
        );
      },
    );
    const currentUID = process.getuid();
    const tokenMode = token.mode & 0o7777;
    if (
      isInsideRepository ||
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      canonicalDirectory !== protectedDirectory ||
      directory.uid !== currentUID ||
      (directory.mode & 0o7777) !== 0o700 ||
      !token.isFile() ||
      token.isSymbolicLink() ||
      token.uid !== currentUID ||
      token.nlink !== 1 ||
      (tokenMode !== 0o400 && tokenMode !== 0o600) ||
      token.size < 1 ||
      token.size > 65_536
    )
      throw new Error();

    return { federationRuleID, identityTokenFile, protectedDirectory };
  } catch {
    throw new Error(
      "Серверная конфигурация workload identity для Codex недействительна или недоступна.",
    );
  }
};
