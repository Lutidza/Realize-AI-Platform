/**
 * @file packages/payload-ai-plugin/src/admin/integrations/formatGitHubTestStatus.util.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Формирует подпись сохранённого результата проверки подключения GitHub.
 */

import type { GitHubIntegrationConnectionDTO } from "@realize/ai-contracts";

export const formatGitHubTestStatus = (
  connection: GitHubIntegrationConnectionDTO | undefined,
): string => {
  if (!connection || connection.lastTestStatus === "never")
    return "Ещё не проверено";
  return connection.lastTestStatus === "passed"
    ? "Проверка пройдена"
    : "Последняя проверка не пройдена";
};
