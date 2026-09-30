/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/WorkshopCreateDialog.component.tsx
 * @version 1.0.0
 * @date 2026-09-25
 * @description Создаёт личный дизайн-проект с проверенным брифом через Workshop API.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import { useState } from "react";
import {
  UiButton,
  UiDialog,
  UiInput,
  UiNotice,
  UiSelect,
} from "@realize/ui-kit";
import {
  designWorkshopCommands,
  type CreateDesignProjectInput,
} from "@realize/ai-contracts";
import { WorkshopBriefFields } from "./WorkshopBriefFields.component";
import {
  DesignWorkshopApi,
  workshopErrorMessage,
  WorkshopRequestError,
} from "./DesignWorkshopApi.client";
import {
  WORKSHOP_KINDS,
  WORKSHOP_TARGETS,
} from "./designWorkshopClient.constants";
import type { WorkshopCreateProps } from "./DesignWorkshopClient.types";
import styles from "./Workshop.module.css";

export function WorkshopCreateDialog({
  theme,
  onClose,
  onCreated,
}: WorkshopCreateProps) {
  const [api] = useState(() => new DesignWorkshopApi());
  const [input, setInput] = useState<CreateDesignProjectInput>({
    title: "",
    kind: "reference",
    target: "admin",
    snapshot: {
      schemaVersion: "1.0",
      brief: {
        goal: "",
        audience: "",
        screens: [],
        states: [],
        constraints: [],
        acceptanceCriteria: [],
      },
      files: [],
      sources: [],
    },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (busy) return;
    const parsed = designWorkshopCommands.create.safeParse(input);
    if (!parsed.success) {
      setError(
        "Заполните название, задачу, аудиторию и критерии готовности. Не оставляйте пустые строки между пунктами.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const receipt = await api.mutate("", parsed.data);
      api.complete();
      onCreated(receipt.projectId);
    } catch (reason) {
      setError(
        reason instanceof WorkshopRequestError
          ? reason.message
          : workshopErrorMessage(reason),
      );
      setBusy(false);
    }
  };
  return (
    <UiDialog
      open
      mode={theme}
      size="wide"
      title="Новый дизайн-проект"
      description="Задайте цель и критерии. Материалы и файлы можно добавить после создания."
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      footer={
        <div className={styles.actions}>
          <UiButton variant="secondary" disabled={busy} onClick={onClose}>
            Отмена
          </UiButton>
          <UiButton type="submit" form="workshop-create" disabled={busy}>
            {busy ? "Создание…" : "Создать проект"}
          </UiButton>
        </div>
      }
    >
      <form
        id="workshop-create"
        className={styles.form}
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error && (
          <UiNotice tone="danger" role="alert">
            {error}
          </UiNotice>
        )}
        <label className={styles.field}>
          <span>
            Название проекта <span className={styles.required}>*</span>
          </span>
          <UiInput
            required
            autoFocus
            maxLength={160}
            value={input.title}
            disabled={busy}
            placeholder="Например, Task Manager"
            onChange={(event) =>
              setInput({ ...input, title: event.target.value })
            }
          />
        </label>
        <div className={styles.twoColumns}>
          <label className={styles.field}>
            <span>Результат</span>
            <UiSelect
              value={input.kind}
              disabled={busy}
              onChange={(event) =>
                setInput({
                  ...input,
                  kind: event.target.value as CreateDesignProjectInput["kind"],
                })
              }
            >
              {Object.entries(WORKSHOP_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </UiSelect>
          </label>
          <label className={styles.field}>
            <span>Область</span>
            <UiSelect
              value={input.target}
              disabled={busy}
              onChange={(event) =>
                setInput({
                  ...input,
                  target: event.target
                    .value as CreateDesignProjectInput["target"],
                })
              }
            >
              {Object.entries(WORKSHOP_TARGETS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </UiSelect>
          </label>
        </div>
        <WorkshopBriefFields
          value={input.snapshot.brief}
          disabled={busy}
          onChange={(brief) =>
            setInput({ ...input, snapshot: { ...input.snapshot, brief } })
          }
        />
      </form>
    </UiDialog>
  );
}
