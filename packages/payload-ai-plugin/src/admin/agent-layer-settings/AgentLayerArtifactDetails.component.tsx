/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerArtifactDetails.component.tsx
 * @version 1.0.1
 * @date 2026-09-10
 * @description Показывает типизированное содержимое записи и переходы по связям выбранной версии.
 */

import type {
  JSONValue,
  WorkflowStep,
  WorkflowValueSource,
} from "@realize/ai-contracts";
import { UiBadge, UiSurface } from "@realize/ui-kit";
import type { AgentLayerArtifactDetailsProps } from "./AgentLayerArtifact.types";
import { AgentLayerArtifactRelations } from "./AgentLayerArtifactRelations.component";
import styles from "./AgentLayerArtifactDetails.module.css";

const renderText = (label: string, value: string) => (
  <section className={styles.field}>
    <h3>{label}</h3>
    <p className={styles.text}>{value || "Не указано"}</p>
  </section>
);

const renderList = (
  label: string,
  values: readonly string[],
  empty = "Не указаны",
) => (
  <section className={styles.field}>
    <h3>{label}</h3>
    {values.length ? (
      <ul className={styles.tags}>
        {values.map((value, index) => (
          <li key={`${index}-${value}`}>
            <UiBadge>{value}</UiBadge>
          </li>
        ))}
      </ul>
    ) : (
      <p className={styles.muted}>{empty}</p>
    )}
  </section>
);

const formatLiteral = (value: JSONValue): string => {
  if (value === null) return "Пустое значение";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (Array.isArray(value))
    return value.length ? value.map(formatLiteral).join("; ") : "Пустой список";
  if (typeof value === "object") {
    const fields = Object.entries(value);
    return fields.length
      ? fields.map(([key, item]) => `${key}: ${formatLiteral(item)}`).join("; ")
      : "Нет полей";
  }
  return String(value);
};

const formatValueSource = (source: WorkflowValueSource): string => {
  if (source.source === "literal") return formatLiteral(source.value);
  if (source.source === "input") return `Входные данные · ${source.path}`;
  return `Результат шага ${source.stepKey} · ${source.path}`;
};

const renderStep = (step: WorkflowStep) => {
  switch (step.type) {
    case "agent_turn":
    case "request_input":
      return (
        <>
          <strong>
            {step.type === "agent_turn" ? "Ход агента" : "Запрос ввода"}
          </strong>
          <p>
            Шаблон: <code>{step.promptTemplateKey}</code>
          </p>
          <p>
            Далее: <code>{step.nextStepKey}</code>
          </p>
        </>
      );
    case "capability":
      return (
        <>
          <strong>Вызов возможности</strong>
          <p>
            Возможность: <code>{step.capabilityBindingKey}</code>
          </p>
          <dl className={styles.stepInputs}>
            {Object.entries(step.input).map(([key, source]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{formatValueSource(source)}</dd>
              </div>
            ))}
          </dl>
          <p>
            Далее: <code>{step.nextStepKey}</code>
          </p>
        </>
      );
    case "check":
      return (
        <>
          <strong>Проверка</strong>
          <p>
            Проверка: <code>{step.checkBindingKey}</code>
          </p>
          <p>
            Далее: <code>{step.nextStepKey}</code>
          </p>
        </>
      );
    case "branch": {
      const operator =
        step.condition.operator === "equals"
          ? "равно"
          : step.condition.operator === "not_equals"
            ? "не равно"
            : "существует";
      return (
        <>
          <strong>Условие</strong>
          <p>
            {formatValueSource(step.condition.left)} {operator}
            {step.condition.right
              ? ` ${formatValueSource(step.condition.right)}`
              : ""}
          </p>
          <p>
            Да: <code>{step.trueStepKey}</code> · Нет:{" "}
            <code>{step.falseStepKey}</code>
          </p>
        </>
      );
    }
    case "finish":
      return (
        <>
          <strong>Завершение</strong>
          <p>{step.outcome === "completed" ? "Выполнено" : "Заблокировано"}</p>
        </>
      );
  }
};

const renderContent = ({
  artifact,
  artifacts,
  system,
}: AgentLayerArtifactDetailsProps) => {
  switch (artifact.kind) {
    case "agent_profile": {
      const defaultWorkflow = artifacts.find(
        (item) =>
          item.kind === "workflow_definition" &&
          item.key === artifact.defaultWorkflowKey,
      );
      return (
        <>
          {renderText("Назначение", artifact.description)}
          <div className={styles.fields}>
            {renderText("Язык", artifact.locale)}
            {renderText(
              "Процесс по умолчанию",
              artifact.defaultWorkflowKey
                ? `${defaultWorkflow?.title ?? "Не найдено"} · ${artifact.defaultWorkflowKey}`
                : "Не выбран",
            )}
          </div>
        </>
      );
    }
    case "local_role":
      return renderText("Инструкции роли", artifact.instructions);
    case "local_rule":
      return (
        <>
          {renderText("Инструкция", artifact.instruction)}
          {renderText("Приоритет", String(artifact.priority))}
        </>
      );
    case "skill":
      return (
        <>
          {renderText("Назначение", artifact.description)}
          {renderText("Инструкции", artifact.instructions)}
          {renderList("Условия применения", artifact.triggerTerms)}
        </>
      );
    case "prompt_template": {
      const slots = {
        agent_instructions: "Инструкции агента",
        planner: "Планирование",
        reviewer: "Рецензирование",
        workflow_step: "Шаг рабочего процесса",
      };
      return (
        <>
          {renderText("Назначение шаблона", slots[artifact.slot])}
          {renderText("Текст шаблона", artifact.template)}
          {renderList(
            "Переменные",
            artifact.variables,
            "Шаблон не содержит переменных",
          )}
        </>
      );
    }
    case "capability_binding": {
      const descriptor = system.capabilities.find(
        (item) =>
          item.id === artifact.capability.id &&
          item.version === artifact.capability.version,
      );
      return (
        <>
          {renderList("Разрешённые действия", artifact.allowedActions)}
          {renderText(
            "Максимум объектов",
            artifact.maxTargets === undefined
              ? `По системной основе${descriptor ? ` · ${descriptor.limits.maxTargets}` : ""}`
              : String(artifact.maxTargets),
          )}
          {renderList(
            "Области чтения",
            artifact.readScopes ?? descriptor?.scopes.read ?? [],
            artifact.readScopes === undefined
              ? "Определяются системной основой"
              : "Нет разрешённых областей",
          )}
          {renderList(
            "Области записи",
            artifact.writeScopes ?? descriptor?.scopes.write ?? [],
            artifact.writeScopes === undefined
              ? "Определяются системной основой"
              : "Нет разрешённых областей",
          )}
          {(artifact.readScopes === undefined ||
            artifact.writeScopes === undefined) && (
            <p className={styles.muted}>
              Незаданные области наследуются из системной основы.
            </p>
          )}
        </>
      );
    }
    case "check_binding":
      return renderText("Идентификатор системной проверки", artifact.checkID);
    case "workflow_definition":
      return (
        <>
          {renderText("Назначение", artifact.description)}
          <div className={styles.fields}>
            {renderText("Начальный шаг", artifact.entryStepKey)}
            {renderText("Лимит выполнения шагов", String(artifact.maxSteps))}
          </div>
          <section className={styles.field}>
            <h3>
              Шаги{" "}
              <span className={styles.muted}>· {artifact.steps.length}</span>
            </h3>
            <ol className={styles.steps}>
              {artifact.steps.map((step) => (
                <li key={step.key}>
                  <div className={styles.stepKey}>
                    <code>{step.key}</code>
                    {step.key === artifact.entryStepKey && (
                      <UiBadge>Начало</UiBadge>
                    )}
                  </div>
                  <div className={styles.stepBody}>{renderStep(step)}</div>
                </li>
              ))}
            </ol>
          </section>
        </>
      );
  }
};

/** Содержимое и связи берутся из одного draft; переходы контролирует родительский редактор. */
export const AgentLayerArtifactDetails = (
  props: AgentLayerArtifactDetailsProps,
) => {
  const { artifact, artifacts, system, onSelect, disabled, children } = props;
  return (
    <div className={styles.layout}>
      <UiSurface appearance="flush" className={styles.content}>
        {children ?? renderContent(props)}
      </UiSurface>
      <AgentLayerArtifactRelations
        key={`${artifact.kind}:${artifact.key}`}
        artifact={artifact}
        artifacts={artifacts}
        system={system}
        onSelect={onSelect}
        disabled={disabled}
      />
    </div>
  );
};
