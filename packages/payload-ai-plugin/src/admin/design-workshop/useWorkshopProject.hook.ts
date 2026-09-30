/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/useWorkshopProject.hook.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Управляет загрузкой, черновиком, конфликтами и применением показанного кандидата.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  designSnapshotSchema,
  type DesignChangeDto,
  type DesignProjectDto,
  type DesignRevisionDto,
  type DesignSnapshot,
} from "@realize/ai-contracts";
import {
  DesignWorkshopApi,
  workshopErrorMessage,
  WorkshopRequestError,
} from "./DesignWorkshopApi.client";
import type { WorkshopEditorState } from "./DesignWorkshopClient.types";
import {
  sameWorkshopSnapshot,
  workshopDraftCommand,
} from "./workshopDraft.util";

export function useWorkshopProject(projectId: string) {
  const [api] = useState(() => new DesignWorkshopApi());
  const [state, setState] = useState<WorkshopEditorState | null>(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const path = "/" + encodeURIComponent(projectId);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const project = await api.read<DesignProjectDto>(path, signal);
      const revision = await api.read<DesignRevisionDto>(
        path + "/revisions/" + project.currentRevision.revisionId,
        signal,
      );
      return { project, revision };
    },
    [api, path],
  );

  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal)
      .then((data) => {
        if (!abort.signal.aborted)
          setState({
            ...data,
            draft: data.revision.snapshot,
            summary: "",
            candidate: null,
          });
      })
      .catch((reason) => {
        if (!abort.signal.aborted) setError(workshopErrorMessage(reason));
      });
    return () => abort.abort();
  }, [load]);

  const dirty =
    !!state && !sameWorkshopSnapshot(state.revision.snapshot, state.draft);
  useEffect(() => {
    if (!dirty && !busy) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, busy]);

  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setConflict(false);
    try {
      await action();
    } catch (reason) {
      setConflict(
        reason instanceof WorkshopRequestError && reason.status === 409,
      );
      setError(workshopErrorMessage(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const refresh = (preserveDraft = false) =>
    run(async () => {
      const data = await load();
      api.complete();
      setState((current) => ({
        ...data,
        draft:
          preserveDraft && current ? current.draft : data.revision.snapshot,
        summary: preserveDraft && current ? current.summary : "",
        candidate: null,
      }));
      if (preserveDraft)
        setNotice(
          "База обновлена. Черновик сохранён: проверьте все изменения перед применением.",
        );
    });

  const prepare = () =>
    run(async () => {
      if (!state) return;
      const parsed = designSnapshotSchema.safeParse(state.draft);
      if (!parsed.success || !state.summary.trim()) {
        throw new WorkshopRequestError(
          parsed.success
            ? "Опишите изменения перед сохранением."
            : parsed.error.issues.map((issue) => issue.message).join(" "),
        );
      }
      const command = workshopDraftCommand(
        state.revision.revisionId,
        state.revision.snapshot,
        parsed.data,
        state.summary,
      );
      const receipt = await api.mutate(path + "/changes/prepare", command);
      const candidate = await api.read<DesignChangeDto>(
        path + "/changes/" + receipt.changeId,
      );
      setState((current) => (current ? { ...current, candidate } : current));
    });

  const apply = () =>
    run(async () => {
      if (!state?.candidate) return;
      const receipt = await api.mutate(
        path + "/changes/" + state.candidate.changeId + "/apply",
        {},
      );
      const revision = await api.read<DesignRevisionDto>(
        path + "/revisions/" + receipt.revision.revisionId,
      );
      api.complete();
      setState({
        project: {
          ...state.project,
          currentRevision: receipt.revision,
          updatedAt: revision.createdAt,
        },
        revision,
        draft: revision.snapshot,
        summary: "",
        candidate: null,
      });
      setNotice("Версия " + revision.number + " сохранена.");
    });

  return {
    state,
    error,
    conflict,
    busy,
    dirty,
    notice,
    api,
    prepare,
    apply,
    refresh,
    setDraft(draft: DesignSnapshot) {
      if (lock.current) return;
      setState((current) =>
        current ? { ...current, draft, candidate: null } : current,
      );
      setNotice("");
    },
    setSummary(summary: string) {
      setState((current) => (current ? { ...current, summary } : current));
    },
    closeReview() {
      if (lock.current) return;
      api.complete();
      setState((current) =>
        current ? { ...current, candidate: null } : current,
      );
    },
    discardDraft() {
      if (lock.current) return;
      api.complete();
      setState((current) =>
        current
          ? {
              ...current,
              draft: current.revision.snapshot,
              summary: "",
              candidate: null,
            }
          : current,
      );
      setError("");
      setConflict(false);
      setNotice("Несохранённый черновик отменён.");
    },
  };
}
