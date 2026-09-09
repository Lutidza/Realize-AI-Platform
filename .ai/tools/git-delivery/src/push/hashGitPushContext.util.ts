/**
 * @file .ai/tools/git-delivery/src/push/hashGitPushContext.util.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Связывает журнал с неизменным заданием push независимо от отдельного разрешения на повтор.
 */

import { createHash } from "node:crypto";
import type { GitPushContext } from "./GitPush.types.ts";

/** Сохраняет binding старых журналов; recovery не может изменить назначение или проверки. */
export function hashGitPushContext(context: GitPushContext): string {
  const { recovery: _recovery, ...operation } = context;
  return createHash("sha256").update(JSON.stringify(operation)).digest("hex");
}
