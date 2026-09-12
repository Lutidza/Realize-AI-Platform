/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/formatAgentLayerValidationIssue.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Даёт понятные русские описания кодов проверки installation-конфигурации.
 */
import type { AIConfigValidationIssue } from "@realize/ai-contracts";
export const formatAgentLayerValidationIssue = (
  issue: AIConfigValidationIssue,
): string => {
  const messages: Record<string, string> = {
    config_reference_missing: "Ссылка ведёт на отсутствующий артефакт.",
    config_reference_disabled: "Ссылка ведёт на выключенный артефакт.",
    config_artifact_revision_non_monotonic:
      "Версия артефакта не соответствует сохранённой. Загрузите актуальный черновик.",
    config_artifact_duplicate: "Ключ артефакта повторяется.",
    config_artifact_invalid: "Проверьте обязательные поля и формат артефакта.",
    config_issue_limit_exceeded:
      "Список ошибок сокращён. Исправьте показанные ошибки и повторите проверку.",
    config_profile_compile_failed:
      "Профиль несовместим с системными возможностями или его связями.",
    config_draft_invalid:
      "Проверьте структуру черновика и его обязательные поля.",
  };
  return (
    messages[issue.code] ??
    "Проверка конфигурации не пройдена. Проверьте поле или связь по указанному пути."
  );
};
