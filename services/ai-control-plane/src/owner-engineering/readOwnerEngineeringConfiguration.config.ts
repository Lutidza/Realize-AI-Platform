/**
 * @file services/ai-control-plane/src/owner-engineering/readOwnerEngineeringConfiguration.config.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Включает локальный инженерный runtime только для явно заданного пользователя ОС и приватного журнала.
 * @see documentation/architecture/codex-integration.md
 */
import { lstat, mkdir, realpath } from "node:fs/promises";
import { hostname, userInfo } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { OwnerEngineeringConfiguration } from "./OwnerEngineeringRuntime.types";

/** Ошибка явной настройки не превращается в бесшумный запуск с более широкими правами. */
export const readOwnerEngineeringConfiguration = async (
  workspaceRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<OwnerEngineeringConfiguration | null> => {
  if (environment.REALIZE_AI_OWNER_ENGINEERING_ENABLED !== "true") return null;
  const user = userInfo();
  const osUser = environment.REALIZE_AI_OWNER_ENGINEERING_OS_USER;
  const stateRoot = resolve(
    environment.REALIZE_AI_OWNER_ENGINEERING_STATE_ROOT ||
      join(
        user.homedir,
        ".local",
        "share",
        "realize-ai-cms",
        "owner-engineering",
      ),
  );
  if (
    process.platform !== "linux" ||
    user.uid <= 0 ||
    !osUser ||
    osUser !== user.username ||
    environment.REALIZE_AI_RUNTIME_MODE !== "local-development" ||
    environment.REALIZE_AI_RUNTIME_ISOLATED === "true" ||
    !isAbsolute(workspaceRoot) ||
    (await realpath(workspaceRoot)) !== workspaceRoot ||
    stateRoot === workspaceRoot ||
    stateRoot.startsWith(`${workspaceRoot}/`)
  )
    throw Error("owner_engineering_configuration_invalid");
  const ownerIDs = (environment.REALIZE_PLATFORM_OWNER_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[1-9]\d{0,14}$/.test(id));
  if (!ownerIDs.length) throw Error("owner_engineering_owner_required");
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  const stat = await lstat(stateRoot);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== user.uid ||
    (stat.mode & 0o077) !== 0 ||
    (await realpath(stateRoot)) !== stateRoot
  )
    throw Error("owner_engineering_state_invalid");
  return {
    enabled: true,
    mode: "owner-host",
    hostname: hostname(),
    osUser,
    workspaceRoot,
    stateRoot,
    ownerIDs,
  };
};
