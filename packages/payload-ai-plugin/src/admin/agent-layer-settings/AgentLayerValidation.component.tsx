/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerValidation.component.tsx
 * @version 1.0.1
 * @date 2026-09-10
 * @description Показывает результат проверки с ревизией и русскими пояснениями ошибок.
 */

import { UiNotice } from "@realize/ui-kit";
import type { AgentLayerValidationProps } from "./AgentLayerPanels.types";
import { formatAgentLayerValidationIssue } from "./formatAgentLayerValidationIssue.util";
import styles from "./AgentLayerSettings.module.css";

export const AgentLayerValidation = ({
  validation,
  draft,
}: AgentLayerValidationProps) => {
  const isStale =
    draft?.id !== validation.draftID ||
    draft.revision !== validation.resultingRevision;
  return (
    <UiNotice
      role="status"
      tone={isStale ? "neutral" : validation.valid ? "positive" : "danger"}
      title={
        isStale
          ? "Предыдущая проверка"
          : validation.valid
            ? "Черновик прошёл проверку"
            : "Нужно исправить ошибки"
      }
    >
      <p className={styles.noticeText}>
        Проверена ревизия {validation.checkedRevision}.
        {isStale
          ? " Черновик изменился — запустите проверку снова."
          : validation.valid
            ? " Создайте выпуск и просмотрите его перед активацией для новых запусков чата."
            : " Исправьте указанные поля или связи и повторите проверку."}
      </p>
      {validation.issues.length > 0 && (
        <ul className={styles.validationIssues}>
          {validation.issues.map((issue, index) => (
            <li key={`${issue.path}-${issue.code}-${index}`}>
              <span>{formatAgentLayerValidationIssue(issue)}</span>
              <code>{issue.path}</code>
            </li>
          ))}
        </ul>
      )}
    </UiNotice>
  );
};
