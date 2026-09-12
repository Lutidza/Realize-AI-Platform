/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerEditor.hook.ts
 * @version 1.5.0
 * @date 2026-09-10
 * @description Управляет выбранной формой записи и общим циклом сохранения и выхода.
 */

"use client";

import { useState } from "react";
import type {
  AgentLayerEditorState,
  AgentLayerActiveForm,
  UseAgentLayerEditorOptions,
} from "./AgentLayerEditor.types";
import {
  getAgentLayerRuleFields,
  getAgentLayerRuleFormError,
} from "./agentLayerPresentation.util";
import { getAgentLayerRuleReferences } from "./getAgentLayerRuleReferences.util";
import { getAgentLayerProfileFields } from "./getAgentLayerProfileFields.util";
import { validateAgentLayerProfileInput } from "./validateAgentLayerProfileInput.validator";
import { createAgentLayerProfileCopy } from "./createAgentLayerProfileCopy.util";
import { getAgentLayerInstructionFields } from "./getAgentLayerInstructionFields.util";
import { validateAgentLayerInstructionInput } from "./validateAgentLayerInstructionInput.validator";
import { createAgentLayerInstructionCopy } from "./createAgentLayerInstructionCopy.util";
import type { AgentLayerInstructionInput } from "./AgentLayerInstruction.types";
import type { AgentLayerBindingInput } from "./AgentLayerBinding.types";
import { getAgentLayerBindingFields } from "./getAgentLayerBindingFields.util";
import { validateAgentLayerBindingInput } from "./validateAgentLayerBindingInput.validator";
import { createAgentLayerBindingCopy } from "./createAgentLayerBindingCopy.util";
import type { AgentLayerWorkflowInput } from "./AgentLayerWorkflow.types";
import { getAgentLayerWorkflowFields } from "./getAgentLayerWorkflowFields.util";
import { validateAgentLayerWorkflowInput } from "./validateAgentLayerWorkflowInput.validator";
import { createAgentLayerWorkflowCopy } from "./createAgentLayerWorkflowCopy.util";

/** Не заменяет ввод ответом API до успешной записи или явного решения пользователя. */
export const useAgentLayerEditor = ({
  configuration,
}: UseAgentLayerEditorOptions): AgentLayerEditorState => {
  const [activeForm, setActiveForm] = useState<AgentLayerActiveForm | null>(
    null,
  );
  const form = activeForm?.kind === "local_rule" ? activeForm : null;
  const profileForm = activeForm?.kind === "agent_profile" ? activeForm : null;
  const instructionForm =
    activeForm?.kind === "instruction" ? activeForm : null;
  const bindingForm = activeForm?.kind === "binding" ? activeForm : null;
  const workflowForm =
    activeForm?.kind === "workflow_definition" ? activeForm : null;
  const [formError, setFormError] = useState<string>();
  const [profileNotice, setProfileNotice] = useState<string>();
  const [instructionNotice, setInstructionNotice] = useState<string>();
  const [bindingNotice, setBindingNotice] = useState<string>();
  const [workflowNotice, setWorkflowNotice] = useState<string>();
  const [pendingIntent, setPendingIntent] = useState<
    "save" | "remove" | "create"
  >();
  const { draft } = configuration;
  const isDirty = Boolean(
    activeForm &&
    (activeForm.originalKey === undefined ||
      JSON.stringify(activeForm.fields) !==
        JSON.stringify(activeForm.baseline)),
  );
  const isLocked =
    configuration.isBusy ||
    configuration.isLoading ||
    configuration.hasPendingMutation;
  const isReadOnly =
    !draft || (draft.state !== "editing" && draft.state !== "ready");
  const canLeave = () =>
    !isDirty ||
    window.confirm(
      "Есть несохранённые изменения записи. Отбросить их и продолжить?",
    );
  const clear = () => {
    setActiveForm(null);
    setFormError(undefined);
    setProfileNotice(undefined);
    setInstructionNotice(undefined);
    setBindingNotice(undefined);
    setWorkflowNotice(undefined);
    setPendingIntent(undefined);
  };
  const acceptSave = () =>
    setActiveForm((current) => {
      if (!current) return current;
      if (current.kind === "local_rule")
        return {
          ...current,
          originalKey: current.fields.key,
          baseline: { ...current.fields },
        };
      if (current.kind === "agent_profile")
        return {
          ...current,
          originalKey: current.fields.key,
          baseline: structuredClone(current.fields),
        };
      if (current.kind === "binding")
        return {
          ...current,
          originalKey: current.fields.key,
          baseline: structuredClone(current.fields),
        };
      if (current.kind === "workflow_definition")
        return {
          ...current,
          originalKey: current.fields.key,
          baseline: structuredClone(current.fields),
        };
      return {
        ...current,
        originalKey: current.fields.key,
        baseline: structuredClone(current.fields),
      };
    });

  const openInstructionForm = (
    fields: AgentLayerInstructionInput,
    originalKey?: string,
    notice?: string,
  ) => {
    if (!draft) return;
    setActiveForm({
      kind: "instruction",
      draftID: draft.id,
      originalKey,
      fields,
      baseline: structuredClone(fields),
    });
    setFormError(undefined);
    setProfileNotice(undefined);
    setInstructionNotice(notice);
    setBindingNotice(undefined);
    setPendingIntent(undefined);
  };

  const openBindingForm = (
    fields: AgentLayerBindingInput,
    originalKey?: string,
    notice?: string,
  ) => {
    if (!draft) return;
    setActiveForm({
      kind: "binding",
      draftID: draft.id,
      originalKey,
      fields,
      baseline: structuredClone(fields),
    });
    setFormError(undefined);
    setProfileNotice(undefined);
    setInstructionNotice(undefined);
    setBindingNotice(notice);
    setPendingIntent(undefined);
  };

  const openWorkflowForm = (
    fields: AgentLayerWorkflowInput,
    originalKey?: string,
    notice?: string,
  ) => {
    if (!draft) return;
    setActiveForm({
      kind: "workflow_definition",
      draftID: draft.id,
      originalKey,
      fields,
      baseline: structuredClone(fields),
    });
    setFormError(undefined);
    setWorkflowNotice(notice);
    setProfileNotice(undefined);
    setInstructionNotice(undefined);
    setBindingNotice(undefined);
    setPendingIntent(undefined);
  };

  return {
    form,
    profileForm,
    instructionForm,
    instructionNotice,
    bindingForm,
    bindingNotice,
    workflowForm,
    workflowNotice,
    profileNotice,
    formError,
    isDirty,
    isReadOnly,
    isLocked,
    update: (key, value) => {
      if (isLocked || isReadOnly || (key === "key" && form?.originalKey))
        return;
      setActiveForm((current) =>
        current?.kind === "local_rule"
          ? { ...current, fields: { ...current.fields, [key]: value } }
          : current,
      );
      setFormError(undefined);
    },
    updateProfile: (key, value) => {
      if (
        isLocked ||
        isReadOnly ||
        !profileForm ||
        (key === "key" && profileForm.originalKey)
      )
        return;
      const removedDefault =
        key === "workflowKeys" &&
        profileForm.fields.defaultWorkflowKey &&
        Array.isArray(value) &&
        !value.includes(profileForm.fields.defaultWorkflowKey);
      setActiveForm((current) => {
        if (current?.kind !== "agent_profile") return current;
        const fields = { ...current.fields, [key]: value };
        if (removedDefault || (key === "defaultWorkflowKey" && !value))
          delete fields.defaultWorkflowKey;
        return { ...current, fields };
      });
      setFormError(undefined);
      setProfileNotice(
        removedDefault
          ? "Процесс по умолчанию снят, потому что он больше не выбран для профиля."
          : undefined,
      );
    },
    updateInstruction: (input) => {
      if (
        isLocked ||
        isReadOnly ||
        !instructionForm ||
        input.kind !== instructionForm.fields.kind
      )
        return;
      setActiveForm({
        ...instructionForm,
        kind: "instruction",
        fields: structuredClone({
          ...input,
          key: instructionForm.originalKey ?? input.key,
        }),
      });
      setFormError(undefined);
    },
    selectInstruction: (artifact) => {
      if (isLocked || !draft) return false;
      if (
        instructionForm?.draftID === draft.id &&
        instructionForm.fields.kind === artifact.kind &&
        instructionForm.originalKey === artifact.key
      )
        return true;
      if (!canLeave()) return false;
      openInstructionForm(
        getAgentLayerInstructionFields(artifact),
        artifact.key,
      );
      return true;
    },
    newInstruction: (kind) => {
      if (
        isLocked ||
        isReadOnly ||
        !draft ||
        draft.artifacts.length >= 512 ||
        !canLeave()
      )
        return false;
      openInstructionForm(getAgentLayerInstructionFields(kind));
      return true;
    },
    copyInstruction: (artifact) => {
      if (
        isLocked ||
        isReadOnly ||
        !draft ||
        draft.artifacts.length >= 512 ||
        !canLeave()
      )
        return false;
      openInstructionForm(
        createAgentLayerInstructionCopy(artifact, draft.artifacts),
        undefined,
        "Копия открыта для редактирования. Сохраните её, чтобы добавить в черновик.",
      );
      return true;
    },
    updateBinding: (input) => {
      if (
        isLocked ||
        isReadOnly ||
        !bindingForm ||
        input.kind !== bindingForm.fields.kind
      )
        return;
      setActiveForm({
        ...bindingForm,
        kind: "binding",
        fields: structuredClone({
          ...input,
          key: bindingForm.originalKey ?? input.key,
        }),
      });
      setFormError(undefined);
    },
    selectBinding: (artifact) => {
      if (isLocked || !draft) return false;
      if (
        bindingForm?.draftID === draft.id &&
        bindingForm.fields.kind === artifact.kind &&
        bindingForm.originalKey === artifact.key
      )
        return true;
      if (!canLeave()) return false;
      openBindingForm(getAgentLayerBindingFields(artifact), artifact.key);
      return true;
    },
    newBinding: (kind) => {
      if (
        isLocked ||
        isReadOnly ||
        !draft ||
        draft.artifacts.length >= 512 ||
        !canLeave()
      )
        return false;
      openBindingForm(getAgentLayerBindingFields(kind));
      return true;
    },
    copyBinding: (artifact) => {
      if (
        isLocked ||
        isReadOnly ||
        !draft ||
        draft.artifacts.length >= 512 ||
        !canLeave()
      )
        return false;
      openBindingForm(
        createAgentLayerBindingCopy(artifact, draft.artifacts),
        undefined,
        "Копия открыта для редактирования. Сохраните её, чтобы добавить в черновик.",
      );
      return true;
    },
    updateWorkflow: (input) => {
      if (isLocked || isReadOnly || !workflowForm) return;
      setActiveForm({
        ...workflowForm,
        kind: "workflow_definition",
        fields: structuredClone({
          ...input,
          key: workflowForm.originalKey ?? input.key,
        }),
      });
      setFormError(undefined);
    },
    selectWorkflow: (artifact) => {
      if (isLocked || !draft) return false;
      if (
        workflowForm?.draftID === draft.id &&
        workflowForm.originalKey === artifact.key
      )
        return true;
      if (!canLeave()) return false;
      openWorkflowForm(getAgentLayerWorkflowFields(artifact), artifact.key);
      return true;
    },
    newWorkflow: () => {
      if (
        isLocked ||
        isReadOnly ||
        !draft ||
        draft.artifacts.length >= 512 ||
        !canLeave()
      )
        return false;
      openWorkflowForm(getAgentLayerWorkflowFields());
      return true;
    },
    copyWorkflow: (artifact) => {
      if (
        isLocked ||
        isReadOnly ||
        !draft ||
        draft.artifacts.length >= 512 ||
        !canLeave()
      )
        return false;
      openWorkflowForm(
        createAgentLayerWorkflowCopy(artifact, draft.artifacts),
        undefined,
        "Копия открыта для редактирования. Сохраните её, чтобы добавить в черновик.",
      );
      return true;
    },
    selectRule: (rule) => {
      if (isLocked || !draft) return false;
      if (form?.draftID === draft.id && form.originalKey === rule.key)
        return true;
      if (!canLeave()) return false;
      const fields = getAgentLayerRuleFields(rule);
      setActiveForm({
        kind: "local_rule",
        draftID: draft.id,
        originalKey: rule.key,
        fields,
        baseline: { ...fields },
      });
      setFormError(undefined);
      setProfileNotice(undefined);
      setPendingIntent(undefined);
      return true;
    },
    newRule: () => {
      if (
        isLocked ||
        isReadOnly ||
        !draft ||
        draft.artifacts.length >= 512 ||
        !canLeave()
      )
        return false;
      const fields = getAgentLayerRuleFields();
      setActiveForm({
        kind: "local_rule",
        draftID: draft.id,
        fields,
        baseline: { ...fields },
      });
      setFormError(undefined);
      setProfileNotice(undefined);
      setPendingIntent(undefined);
      return true;
    },
    selectProfile: (profile) => {
      if (isLocked || !draft) return false;
      if (
        profileForm?.draftID === draft.id &&
        profileForm.originalKey === profile.key
      )
        return true;
      if (!canLeave()) return false;
      const fields = getAgentLayerProfileFields(profile);
      setActiveForm({
        kind: "agent_profile",
        draftID: draft.id,
        originalKey: profile.key,
        fields,
        baseline: structuredClone(fields),
      });
      setFormError(undefined);
      setProfileNotice(undefined);
      setPendingIntent(undefined);
      return true;
    },
    newProfile: () => {
      if (
        isLocked ||
        isReadOnly ||
        !draft ||
        draft.artifacts.length >= 512 ||
        !canLeave()
      )
        return false;
      const fields = getAgentLayerProfileFields();
      setActiveForm({
        kind: "agent_profile",
        draftID: draft.id,
        fields,
        baseline: structuredClone(fields),
      });
      setFormError(undefined);
      setProfileNotice(undefined);
      setPendingIntent(undefined);
      return true;
    },
    copyProfile: (profile) => {
      if (
        isLocked ||
        isReadOnly ||
        !draft ||
        draft.artifacts.length >= 512 ||
        !canLeave()
      )
        return false;
      const fields = createAgentLayerProfileCopy(profile, draft.artifacts);
      setActiveForm({
        kind: "agent_profile",
        draftID: draft.id,
        fields,
        baseline: structuredClone(fields),
      });
      setFormError(undefined);
      setProfileNotice(
        "Копия открыта для редактирования. Сохраните её, чтобы добавить в черновик.",
      );
      setPendingIntent(undefined);
      return true;
    },
    close: () => {
      if (isLocked || !canLeave()) return false;
      clear();
      return true;
    },
    reset: () => {
      if (isLocked || !activeForm || !canLeave()) return;
      if (!activeForm.originalKey) clear();
      else {
        if (activeForm.kind === "local_rule")
          setActiveForm({ ...activeForm, fields: { ...activeForm.baseline } });
        else if (activeForm.kind === "agent_profile")
          setActiveForm({
            ...activeForm,
            fields: structuredClone(activeForm.baseline),
          });
        else if (activeForm.kind === "binding")
          setActiveForm({
            ...activeForm,
            fields: structuredClone(activeForm.baseline),
          });
        else if (activeForm.kind === "workflow_definition")
          setActiveForm({
            ...activeForm,
            fields: structuredClone(activeForm.baseline),
          });
        else
          setActiveForm({
            ...activeForm,
            fields: structuredClone(activeForm.baseline),
          });
        setFormError(undefined);
        setProfileNotice(undefined);
        setInstructionNotice(undefined);
        setBindingNotice(undefined);
        setWorkflowNotice(undefined);
        setPendingIntent(undefined);
      }
    },
    save: async () => {
      if (isLocked || isReadOnly || !activeForm || !isDirty) return;
      const error =
        activeForm.kind === "local_rule"
          ? getAgentLayerRuleFormError(activeForm.fields)
          : activeForm.kind === "agent_profile"
            ? validateAgentLayerProfileInput(activeForm.fields)
            : activeForm.kind === "binding"
              ? validateAgentLayerBindingInput(activeForm.fields)
              : activeForm.kind === "workflow_definition"
                ? validateAgentLayerWorkflowInput(activeForm.fields)
                : validateAgentLayerInstructionInput(activeForm.fields);
      setFormError(error);
      if (error) return;
      setPendingIntent("save");
      const saved =
        activeForm.kind === "local_rule"
          ? await configuration.saveRule(
              {
                ...activeForm.fields,
                priority: Number(activeForm.fields.priority),
              },
              activeForm.originalKey,
            )
          : activeForm.kind === "agent_profile"
            ? await configuration.saveProfile(
                activeForm.fields,
                activeForm.originalKey,
              )
            : activeForm.kind === "binding"
              ? await configuration.saveBinding(
                  activeForm.fields,
                  activeForm.originalKey,
                )
              : activeForm.kind === "workflow_definition"
                ? await configuration.saveWorkflow(
                    activeForm.fields,
                    activeForm.originalKey,
                  )
                : await configuration.saveInstruction(
                    activeForm.fields,
                    activeForm.originalKey,
                  );
      if (saved) {
        acceptSave();
        setProfileNotice(undefined);
        setInstructionNotice(undefined);
        setBindingNotice(undefined);
        setWorkflowNotice(undefined);
        setPendingIntent(undefined);
      }
    },
    remove: async () => {
      if (isLocked || isReadOnly || !draft || !form?.originalKey) return;
      if (getAgentLayerRuleReferences(draft, form.originalKey).length) return;
      if (
        !window.confirm(
          `Удалить правило «${form.baseline.title || form.originalKey}» из черновика?${isDirty ? " Несохранённые изменения будут потеряны." : ""}`,
        )
      )
        return;
      setPendingIntent("remove");
      if (await configuration.removeRule(form.originalKey)) clear();
    },
    selectDraft: async (id) => {
      if (isLocked || id === draft?.id || !canLeave()) return false;
      if (!(await configuration.selectDraft(id))) return false;
      clear();
      return true;
    },
    createDraft: async (copySelected) => {
      if (isLocked || !canLeave()) return false;
      setPendingIntent("create");
      if (!(await configuration.createDraft({ copySelected }))) return false;
      clear();
      return true;
    },
    refresh: async () => {
      if (isLocked || !canLeave()) return false;
      if (!(await configuration.refresh())) return false;
      clear();
      return true;
    },
    validate: async () => {
      if (isLocked || isDirty) return;
      // Проверка имеет собственный retry и не должна завершать прежнее сохранение формы.
      setPendingIntent(undefined);
      await configuration.validateDraft();
    },
    retry: async () => {
      if (configuration.isBusy || !configuration.hasPendingMutation) return;
      if (await configuration.retryMutation()) {
        if (pendingIntent === "save") {
          acceptSave();
          setInstructionNotice(undefined);
          setBindingNotice(undefined);
          setWorkflowNotice(undefined);
          setProfileNotice(undefined);
        } else if (pendingIntent) clear();
        setPendingIntent(undefined);
      }
    },
  };
};
