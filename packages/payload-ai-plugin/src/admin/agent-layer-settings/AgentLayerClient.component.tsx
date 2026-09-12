/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerClient.component.tsx
 * @version 1.7.0
 * @date 2026-09-11
 * @description Соединяет навигацию, каталоги и содержимое записей с защищённым редактором конфигурации.
 */

"use client";

import {
  ArrowLeft,
  Copy,
  Info,
  Layers,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  UiBadge,
  UiButton,
  UiNotice,
  UiSelect,
  UiSurface,
} from "@realize/ui-kit";
import { useId } from "react";
import type { AIConfigArtifactKind } from "@realize/ai-contracts";
import { AdminUiTheme } from "../AdminUiTheme.component";
import type { AgentLayerClientProps } from "./AgentLayerClient.types";
import { AgentLayerOverview } from "./AgentLayerOverview.component";
import { AgentLayerCatalog } from "./AgentLayerCatalog.component";
import { AgentLayerArtifactDetails } from "./AgentLayerArtifactDetails.component";
import { AgentLayerNavigation } from "./AgentLayerNavigation.component";
import { AgentLayerRuleEditor } from "./AgentLayerRuleEditor.component";
import { AgentLayerProfileEditor } from "./AgentLayerProfileEditor.component";
import { AgentLayerInstructionEditor } from "./AgentLayerInstructionEditor.component";
import { AgentLayerBindingEditor } from "./AgentLayerBindingEditor.component";
import { AgentLayerWorkflowEditor } from "./AgentLayerWorkflowEditor.component";
import { AgentLayerArtifactRelations } from "./AgentLayerArtifactRelations.component";
import { AGENT_LAYER_CREATE_LABELS } from "./agentLayerEditableKinds.config";
import { AgentLayerSystem } from "./AgentLayerSystem.component";
import { AgentLayerVersions } from "./AgentLayerVersions.component";
import { AgentLayerReleaseInspector } from "./AgentLayerReleaseInspector.component";
import { AgentLayerValidation } from "./AgentLayerValidation.component";
import {
  AGENT_LAYER_KIND_LABELS,
  AGENT_LAYER_STATE_LABELS,
} from "./agentLayerPresentation.util";
import { AGENT_LAYER_SECTIONS } from "./agentLayerSections.config";
import { useAgentLayerConfiguration } from "./useAgentLayerConfiguration.hook";
import { useAgentLayerEditor } from "./useAgentLayerEditor.hook";
import { useAgentLayerLeaveGuard } from "./useAgentLayerLeaveGuard.hook";
import { useAgentLayerWorkspace } from "./useAgentLayerWorkspace.hook";
import { useAgentLayerDeepLink } from "./useAgentLayerDeepLink.hook";
import styles from "./AgentLayerSettings.module.css";

export const AgentLayerClient = ({ settingsURL }: AgentLayerClientProps) => {
  const configuration = useAgentLayerConfiguration();
  const editor = useAgentLayerEditor({ configuration });
  const { contentRef, ...workspace } = useAgentLayerWorkspace({
    configuration,
    editor,
  });
  const id = useId();
  const deepLink = useAgentLayerDeepLink({
    ready: Boolean(configuration.bootstrap),
    busy: configuration.isLoading || configuration.isBusy,
    dirty: editor.isDirty,
    pending: configuration.hasPendingMutation,
    openRelease: workspace.openRelease,
  });
  useAgentLayerLeaveGuard(editor.isDirty || configuration.hasPendingMutation);
  const { bootstrap, draft } = configuration;
  const {
    selectedArtifact,
    isNewRule,
    isNewProfile,
    newInstructionKind,
    newBindingKind,
    isNewWorkflow,
    section,
  } = workspace;
  const sectionInfo = AGENT_LAYER_SECTIONS[section];
  const hasInspector = Boolean(
    selectedArtifact ||
    isNewRule ||
    isNewProfile ||
    newInstructionKind ||
    newBindingKind ||
    isNewWorkflow,
  );
  const navigationSection = workspace.isViewingRelease
    ? "versions"
    : (selectedArtifact?.kind ??
      (isNewRule
        ? "local_rule"
        : isNewProfile
          ? "agent_profile"
          : (newInstructionKind ??
            newBindingKind ??
            (isNewWorkflow ? "workflow_definition" : section))));
  return (
    <AdminUiTheme>
      <section
        className={styles.page}
        aria-label="Настройки агентского слоя"
        data-settings-url={settingsURL}
      >
        <header className={styles.pageHeader}>
          <div className={styles.titleRow}>
            <div className={styles.pageIcon}>
              <Layers size={23} aria-hidden="true" />
            </div>
            <div>
              <h1>Агентский слой</h1>
              <p>Агенты, инструкции и рабочие процессы установки.</p>
            </div>
          </div>
          <UiButton
            variant="ghost"
            size="icon"
            aria-label="Обновить конфигурацию"
            title="Обновить конфигурацию"
            disabled={editor.isLocked}
            onClick={() => void workspace.refresh()}
          >
            <RefreshCw size={17} aria-hidden="true" />
          </UiButton>
        </header>
        {bootstrap && (
          <div className={styles.configurationBar}>
            <label className={styles.draftSelect} htmlFor={`${id}-draft`}>
              <span>Рабочий черновик</span>
              <UiSelect
                id={`${id}-draft`}
                value={draft?.id ?? ""}
                disabled={editor.isLocked || !bootstrap.drafts.length}
                onChange={(event) =>
                  void workspace.selectDraft(event.target.value)
                }
              >
                {!draft && (
                  <option value="">
                    {bootstrap.drafts.length
                      ? "Выберите черновик"
                      : "Черновиков пока нет"}
                  </option>
                )}
                {bootstrap.drafts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} · редакция {item.revision}
                  </option>
                ))}
              </UiSelect>
            </label>
            {draft && (
              <div className={styles.draftStatus}>
                <UiBadge
                  tone={draft.state === "ready" ? "positive" : "neutral"}
                >
                  {AGENT_LAYER_STATE_LABELS[draft.state]}
                </UiBadge>
                <span>Ред. {draft.revision}</span>
              </div>
            )}
            <div className={styles.configurationActions}>
              <UiButton
                size="small"
                variant="ghost"
                disabled={editor.isLocked}
                onClick={() => void workspace.createDraft()}
              >
                <Plus size={15} aria-hidden="true" />
                Новый черновик
              </UiButton>
              <UiButton
                size="icon"
                variant="ghost"
                aria-label="Создать копию черновика"
                title="Создать копию черновика"
                disabled={editor.isLocked || !draft}
                onClick={() => void workspace.createDraft(true)}
              >
                <Copy size={16} aria-hidden="true" />
              </UiButton>
              <UiButton
                size="small"
                variant="secondary"
                disabled={
                  editor.isLocked ||
                  (draft?.state !== "editing" && draft?.state !== "ready") ||
                  editor.isDirty
                }
                title={editor.isDirty ? "Сначала сохраните запись" : undefined}
                onClick={() =>
                  void (draft?.state === "ready"
                    ? workspace.createRelease()
                    : editor.validate())
                }
              >
                <ShieldCheck size={15} aria-hidden="true" />
                {draft?.state === "ready"
                  ? "Создать выпуск"
                  : "Проверить черновик"}
              </UiButton>
            </div>
          </div>
        )}
        <div className={styles.configurationStatus}>
          <p>
            <Info size={14} aria-hidden="true" />
            {bootstrap?.activePointer
              ? "Активный выпуск применяется к новым запускам чата."
              : "Активного выпуска нет. Чат использует системные инструкции."}
          </p>
          {editor.isDirty ? (
            <UiBadge>Есть несохранённые изменения</UiBadge>
          ) : (
            configuration.notice && (
              <span role="status">{configuration.notice}</span>
            )
          )}
        </div>
        {deepLink.error && (
          <UiNotice tone="danger" role="alert">
            <p>{deepLink.error}</p>
            <UiButton
              variant="secondary"
              disabled={
                editor.isLocked ||
                editor.isDirty ||
                configuration.hasPendingMutation
              }
              onClick={deepLink.retry}
            >
              Открыть выпуск по ссылке
            </UiButton>
          </UiNotice>
        )}
        {configuration.error && (
          <UiNotice
            tone="danger"
            title={
              configuration.errorKind === "conflict"
                ? "Конфигурация изменилась"
                : "Не удалось завершить действие"
            }
            role="alert"
          >
            <div className={styles.errorContent}>
              <p>{configuration.error}</p>
              {!configuration.hasPendingMutation && (
                <UiButton
                  variant="secondary"
                  disabled={configuration.isBusy}
                  onClick={() => void workspace.refresh()}
                >
                  Загрузить актуальную версию
                </UiButton>
              )}
            </div>
          </UiNotice>
        )}
        {configuration.hasPendingMutation && (
          <UiNotice title="Результат записи ещё не подтверждён">
            <div className={styles.errorContent}>
              <p>
                Ввод сохранён в этой вкладке. Повторите проверку той же
                операции.
              </p>
              <UiButton
                variant="secondary"
                disabled={configuration.isBusy}
                onClick={() => void editor.retry()}
              >
                Повторить операцию
              </UiButton>
            </div>
          </UiNotice>
        )}
        {configuration.isLoading && !bootstrap ? (
          <UiSurface className={styles.loading} role="status">
            Загружаем конфигурацию…
          </UiSurface>
        ) : (
          bootstrap && (
            <UiSurface className={styles.workspace}>
              <AgentLayerNavigation
                section={navigationSection}
                artifacts={draft?.artifacts ?? []}
                disabled={editor.isLocked}
                onSelect={workspace.selectSection}
              />
              <div
                role="region"
                ref={contentRef}
                className={styles.main}
                aria-label="Рабочая область конфигурации"
                aria-busy={configuration.isLoading}
              >
                {workspace.isViewingRelease && configuration.release ? (
                  <AgentLayerReleaseInspector
                    key={`${configuration.release.id}:${workspace.releaseArtifact?.kind ?? ""}:${workspace.releaseArtifact?.key ?? ""}`}
                    release={configuration.release}
                    initialArtifact={workspace.releaseArtifact}
                    bootstrap={bootstrap}
                    disabled={editor.isLocked}
                    onBack={workspace.closeRelease}
                    onActivate={(action) =>
                      void configuration.activateRelease(action)
                    }
                  />
                ) : hasInspector && draft ? (
                  <div className={styles.record}>
                    <header className={styles.recordHeader}>
                      <UiButton
                        variant="ghost"
                        size="small"
                        onClick={workspace.closeArtifact}
                        disabled={editor.isLocked}
                      >
                        <ArrowLeft size={16} aria-hidden="true" />К списку
                      </UiButton>
                      <span className={styles.recordPath}>
                        {selectedArtifact
                          ? AGENT_LAYER_KIND_LABELS[selectedArtifact.kind]
                          : newInstructionKind
                            ? AGENT_LAYER_KIND_LABELS[newInstructionKind]
                            : newBindingKind
                              ? AGENT_LAYER_KIND_LABELS[newBindingKind]
                              : isNewWorkflow
                                ? AGENT_LAYER_KIND_LABELS.workflow_definition
                                : isNewProfile
                                  ? "Профили агентов"
                                  : "Правила"}
                      </span>
                      <div className={styles.recordTitle}>
                        <h2>
                          {selectedArtifact?.title ||
                            (newInstructionKind
                              ? AGENT_LAYER_CREATE_LABELS[newInstructionKind]
                              : newBindingKind
                                ? AGENT_LAYER_CREATE_LABELS[newBindingKind]
                                : isNewWorkflow
                                  ? AGENT_LAYER_CREATE_LABELS.workflow_definition
                                  : isNewProfile
                                    ? "Новый профиль"
                                    : isNewRule
                                      ? "Новое правило"
                                      : selectedArtifact?.key)}
                        </h2>
                        <div className={styles.inline}>
                          {editor.isDirty && <UiBadge>Не сохранено</UiBadge>}
                          {selectedArtifact && (
                            <>
                              <UiBadge
                                tone={
                                  selectedArtifact.enabled
                                    ? "positive"
                                    : "neutral"
                                }
                              >
                                {selectedArtifact.enabled
                                  ? "Включено"
                                  : "Выключено"}
                              </UiBadge>
                              <span className={styles.muted}>
                                Ред. {selectedArtifact.revision}
                              </span>
                              {editor.isReadOnly && <UiBadge>Просмотр</UiBadge>}
                            </>
                          )}
                        </div>
                      </div>
                      {selectedArtifact && (
                        <code className={styles.recordKey}>
                          {selectedArtifact.key}
                        </code>
                      )}
                    </header>
                    {editor.profileForm ? (
                      <AgentLayerProfileEditor
                        key={workspace.recordIdentity}
                        draft={draft}
                        editor={editor}
                        onOpen={workspace.openArtifact}
                        onCopy={workspace.copyProfile}
                      />
                    ) : editor.instructionForm ||
                      editor.bindingForm ||
                      editor.workflowForm ? (
                      <>
                        {editor.instructionForm ? (
                          <AgentLayerInstructionEditor
                            key={workspace.recordIdentity}
                            draft={draft}
                            editor={editor}
                            onOpen={workspace.openArtifact}
                            onCopy={workspace.copyInstruction}
                          />
                        ) : editor.workflowForm ? (
                          <AgentLayerWorkflowEditor
                            key={workspace.recordIdentity}
                            draft={draft}
                            system={bootstrap.system}
                            editor={editor}
                            onOpen={workspace.openArtifact}
                            onCopy={workspace.copyWorkflow}
                          />
                        ) : (
                          <AgentLayerBindingEditor
                            key={workspace.recordIdentity}
                            draft={draft}
                            system={bootstrap.system}
                            editor={editor}
                            onCopy={workspace.copyBinding}
                          />
                        )}
                        {selectedArtifact && (
                          <AgentLayerArtifactRelations
                            key={`${selectedArtifact.kind}:${selectedArtifact.key}`}
                            artifact={selectedArtifact}
                            artifacts={draft.artifacts}
                            system={bootstrap.system}
                            onSelect={workspace.openArtifact}
                            disabled={editor.isLocked}
                            incomingOnly
                          />
                        )}
                      </>
                    ) : selectedArtifact ? (
                      <AgentLayerArtifactDetails
                        artifact={selectedArtifact}
                        artifacts={draft.artifacts}
                        system={bootstrap.system}
                        onSelect={workspace.openArtifact}
                        disabled={editor.isLocked}
                      >
                        {selectedArtifact.kind === "local_rule" ? (
                          <AgentLayerRuleEditor draft={draft} editor={editor} />
                        ) : undefined}
                      </AgentLayerArtifactDetails>
                    ) : (
                      <AgentLayerRuleEditor draft={draft} editor={editor} />
                    )}
                  </div>
                ) : section === "overview" ? (
                  <AgentLayerOverview
                    bootstrap={bootstrap}
                    draft={draft}
                    isBusy={editor.isLocked}
                    onSection={workspace.selectSection}
                    onOpen={workspace.openArtifact}
                  />
                ) : section === "system" ? (
                  <AgentLayerSystem system={bootstrap.system} />
                ) : section === "versions" ? (
                  <AgentLayerVersions
                    state={workspace.versions}
                    onStateChange={workspace.setVersions}
                    bootstrap={bootstrap}
                    selectedDraftID={draft?.id}
                    disabled={editor.isLocked}
                    onSelectDraft={(value) => void workspace.selectDraft(value)}
                    onOpenRelease={(value) => void workspace.openRelease(value)}
                  />
                ) : (
                  <AgentLayerCatalog
                    artifacts={draft?.artifacts ?? []}
                    kind={
                      section === "all"
                        ? undefined
                        : (section as AIConfigArtifactKind)
                    }
                    state={workspace.catalog}
                    onStateChange={workspace.setCatalog}
                    onOpen={workspace.openArtifact}
                    onCreate={
                      !editor.isReadOnly
                        ? (kind) => {
                            if (kind === "agent_profile")
                              workspace.newProfile();
                            else if (kind === "local_rule") workspace.newRule();
                            else if (
                              kind === "capability_binding" ||
                              kind === "check_binding"
                            )
                              workspace.newBinding(kind);
                            else if (kind === "workflow_definition")
                              workspace.newWorkflow();
                            else workspace.newInstruction(kind);
                          }
                        : undefined
                    }
                    disabled={editor.isLocked}
                    title={sectionInfo.label}
                    description={sectionInfo.description}
                  />
                )}
                {configuration.validation && !workspace.isViewingRelease && (
                  <div className={styles.validation}>
                    <AgentLayerValidation
                      validation={configuration.validation}
                      draft={draft}
                    />
                  </div>
                )}
              </div>
            </UiSurface>
          )
        )}
      </section>
    </AdminUiTheme>
  );
};
