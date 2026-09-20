/**
 * @file src/components/admin/task-manager/reference/useWorkspaceComposer.hook.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Сохраняет черновик настроек среды и ошибки валидации до успешной команды.
 * @see documentation/specifications/task-management.md
 */

import { useRef, useState } from "react";
import { workspaceDefaults } from "./taskWorkspace.constants";
import type { WorkspaceDraft } from "./taskWorkspace.types";
import type { WorkspaceComposerPersist } from "./WorkspaceViews.types";

export function useWorkspaceComposer(persist: WorkspaceComposerPersist) {
  const [draft, setDraft] = useState<WorkspaceDraft>(() =>
    structuredClone(workspaceDefaults),
  );
  const [baseline, setBaseline] = useState(JSON.stringify(workspaceDefaults));
  const [discardOpen, setDiscardOpen] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLDivElement>(null);
  const load = (value: WorkspaceDraft) => {
    setDraft(structuredClone(value));
    setBaseline(JSON.stringify(value));
    setError("");
    setFieldErrors({});
  };
  return {
    discardOpen,
    setDiscardOpen,
    draft,
    error,
    fieldErrors,
    errorRef,
    dirty: JSON.stringify(draft) !== baseline,
    load,
    change: <K extends keyof WorkspaceDraft>(
      key: K,
      value: WorkspaceDraft[K],
    ) => {
      setDraft((current) => ({ ...current, [key]: value }));
      setError("");
      setFieldErrors({});
    },
    reset: () => load(JSON.parse(baseline) as WorkspaceDraft),
    save: () => {
      const normalized = {
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim(),
        workingDays: [...draft.workingDays].sort((a, b) => a - b),
      };
      const result = persist(normalized);
      if (result.ok) load(normalized);
      else {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        requestAnimationFrame(() => errorRef.current?.focus());
      }
      return result;
    },
  };
}
