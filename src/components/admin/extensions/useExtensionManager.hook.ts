/**
 * @file src/components/admin/extensions/useExtensionManager.hook.ts
 * @version 1.2.0
 * @date 2026-11-12
 * @description Управляет snapshot, независимыми draft и планом над заменяемым template renderer.
 * @see documentation/specifications/extension-management.md
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ExtensionAppearancePlanDto,
  ExtensionAppearanceReceiptDto,
  ExtensionManagerSnapshotDto,
} from "@realize/payload-extension-manager/contracts";
import type { TemplateTarget } from "@realize/template-contracts";
import type {
  ExtensionAppearanceDraft,
  ExtensionCommandResult,
  ExtensionManagerProps,
  ExtensionManagerTransport,
  ExtensionTemplateChange,
} from "./ExtensionManager.types";
import { ExtensionManagerApi } from "./ExtensionManagerApi.adapter";
import { useExtensionCommand } from "./useExtensionCommand.hook";
import type { ExtensionMutationLock } from "./ExtensionMutation.types";
import {
  createExtensionDraft,
  extensionEntriesForTarget,
  extensionTemplateKey,
  findExtensionDraftEntry,
  initialExtensionDraft,
} from "./extensionAppearanceDraft.util";
import { readExtensionSettings } from "./extensionSettingsFields.util";
import { extensionDraftChanged } from "./extensionDraftChanged.util";

export function useExtensionManager(
  props: ExtensionManagerProps,
  transport?: ExtensionManagerTransport,
  lock?: ExtensionMutationLock,
) {
  const [api] = useState(() => transport ?? new ExtensionManagerApi());
  const [initialAppearance] = useState(() => props.appearance);
  const command = useExtensionCommand(api, lock);
  const [snapshot, setSnapshot] = useState<ExtensionManagerSnapshotDto | null>(
    null,
  );
  const [target, setTarget] = useState<TemplateTarget>("admin");
  const [drafts, setDrafts] = useState<
    Record<TemplateTarget, ExtensionAppearanceDraft | null>
  >({ admin: null, frontend: null });
  const [plan, setPlan] = useState<ExtensionAppearancePlanDto | null>(null);
  const [templateChange, setTemplateChange] =
    useState<ExtensionTemplateChange | null>(null);
  const [receipt, setReceipt] = useState<ExtensionAppearanceReceiptDto | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState("Загрузка каталога и назначений…");
  const [clock, setClock] = useState(Date.now);
  const loadGeneration = useRef(0);
  const mounted = useRef(true);

  const loadSnapshot = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const value = await api.snapshot();
      if (!mounted.current || generation !== loadGeneration.current) return;
      setSnapshot(value);
      setDrafts((current) => ({
        admin:
          current.admin ??
          initialExtensionDraft(value, "admin", initialAppearance),
        frontend: current.frontend ?? initialExtensionDraft(value, "frontend"),
      }));
      setNotice(
        value.storage === "ready"
          ? "Каталог и назначения обновлены."
          : "Для сохранения оформления нужна подготовка хранилища.",
      );
      setLoadError(null);
    } catch (cause) {
      if (mounted.current && generation === loadGeneration.current)
        setLoadError(
          cause instanceof Error
            ? cause.message
            : "Не удалось загрузить каталог.",
        );
    } finally {
      if (mounted.current && generation === loadGeneration.current)
        setLoading(false);
    }
  }, [api, initialAppearance]);
  const refresh = () => {
    setLoading(true);
    setLoadError(null);
    return loadSnapshot();
  };
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(loadSnapshot);
    return () => {
      mounted.current = false;
      loadGeneration.current += 1;
    };
  }, [loadSnapshot]);
  useEffect(() => {
    if (!plan) return;
    const delay = Math.max(0, Date.parse(plan.expiresAt) - Date.now());
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.min(delay + 10, 2147483647),
    );
    return () => window.clearTimeout(timer);
  }, [plan]);

  const entries = snapshot
    ? extensionEntriesForTarget(snapshot.catalog.entries, target)
    : [];
  const draft = drafts[target];
  const draftDirty =
    !!draft &&
    !!snapshot &&
    extensionDraftChanged(
      draft,
      initialExtensionDraft(
        snapshot,
        target,
        target === "admin" ? initialAppearance : undefined,
      ),
    );
  const locked = command.locked || loading;
  const canManage =
    snapshot?.permissions.manageAppearance === true &&
    snapshot.storage === "ready";
  const planReadiness = plan
    ? snapshot?.catalog.entries.find(
        (entry) =>
          entry.manifest.id === plan.desiredAssignment.selection.templateId &&
          entry.manifest.version ===
            plan.desiredAssignment.selection.templateVersion,
      )?.readiness
    : undefined;
  const invalidPlanReason =
    !plan || !snapshot
      ? null
      : Date.parse(plan.expiresAt) <= clock
        ? "Срок плана истёк. Подготовьте новый план."
        : plan.catalogHash !== snapshot.catalog.catalogHash ||
            plan.expectedRevision !== snapshot.targets[plan.target].revision
          ? "Каталог или назначение изменились. Подготовьте новый план."
          : null;

  function updateDraft(
    change: (current: ExtensionAppearanceDraft) => ExtensionAppearanceDraft,
  ) {
    if (command.isLocked() || loading) return;
    setDrafts((current) =>
      current[target]
        ? { ...current, [target]: change(current[target]) }
        : current,
    );
    setPlan(null);
    setReceipt(null);
  }
  function selectTemplate(key: string, discardDraft = false): boolean {
    if (command.isLocked() || loading || !canManage) return false;
    const entry = entries.find((item) => extensionTemplateKey(item) === key);
    if (!entry) return false;
    // Открытие настроек текущей версии сохраняет draft, palette и подготовленный plan.
    if (
      draft?.selection.templateId === entry.manifest.id &&
      draft.selection.templateVersion === entry.manifest.version
    )
      return true;
    if (draftDirty && !discardDraft) {
      setTemplateChange({
        key,
        name: `${entry.manifest.displayName} ${entry.manifest.version}`,
        target,
      });
      return false;
    }
    const active =
      snapshot?.targets[target].current ??
      (target === "admin" ? initialAppearance : null);
    const assignment =
      active?.selection.templateId === entry.manifest.id &&
      active.selection.templateVersion === entry.manifest.version
        ? active
        : null;
    updateDraft(() => createExtensionDraft(entry, target, assignment));
    setTemplateChange(null);
    return true;
  }
  function selectPalette(id: string) {
    if (!draft) return;
    const entry = findExtensionDraftEntry(entries, draft);
    const palette = entry?.manifest.palettes.find((item) => item.id === id);
    if (!palette) return;
    updateDraft((current) => ({
      ...current,
      selection: {
        ...current.selection,
        paletteId: palette.id,
        paletteVersion: palette.version,
        mode: palette.modes.includes(current.selection.mode)
          ? current.selection.mode
          : palette.modes[0],
      },
    }));
  }
  async function accept(result: ExtensionCommandResult | undefined) {
    if (!result || !mounted.current) return;
    if (result.kind === "prepare") {
      setClock(Date.now());
      setPlan(result.data.plan);
      setReceipt(null);
      setNotice(
        result.data.replayed
          ? "Результат подготовки подтверждён повторным запросом."
          : "План подготовлен. Проверьте его перед применением.",
      );
    } else {
      setPlan(null);
      setReceipt(result.data.receipt);
      setNotice(
        "Оформление сохранено. Оно будет применено при следующем открытии страницы.",
      );
      await refresh();
      if (mounted.current)
        setNotice(
          "Оформление сохранено. Оно будет применено при следующем открытии страницы.",
        );
    }
  }
  async function prepare(action: "assign" | "recover") {
    if (!snapshot || !canManage || command.isLocked() || loading) return;
    const common = {
      target,
      expectedRevision: snapshot.targets[target].revision,
      expectedCatalogHash: snapshot.catalog.catalogHash,
    };
    if (action === "recover") {
      if (snapshot.targets[target].previous)
        await accept(
          await command.start({
            kind: "prepare",
            input: { action, ...common },
          }),
        );
      return;
    }
    if (!draft || !findExtensionDraftEntry(entries, draft)) return;
    const settings = readExtensionSettings(draft.settingsText);
    if (settings.valid)
      await accept(
        await command.start({
          kind: "prepare",
          input: {
            action,
            ...common,
            selection: draft.selection,
            settings: settings.value,
          },
        }),
      );
  }
  async function apply() {
    if (
      !plan ||
      !canManage ||
      command.isLocked() ||
      loading ||
      invalidPlanReason ||
      planReadiness === "preview-only" ||
      Date.parse(plan.expiresAt) <= Date.now()
    )
      return;
    await accept(
      await command.start({
        kind: "apply",
        input: { planId: plan.planId, expectedPlanHash: plan.planHash },
      }),
    );
  }
  const retry = async () => {
    await accept(await command.retry());
  };
  return {
    snapshot,
    target,
    setTarget: (next: TemplateTarget) => {
      if (!command.isLocked() && !loading) setTarget(next);
    },
    draft,
    entries,
    plan,
    receipt,
    loading,
    loadError,
    notice,
    locked,
    canManage,
    draftDirty,
    templateChange,
    invalidPlanReason,
    planReadiness,
    commandError: command.error,
    pending: command.pending,
    refresh,
    selectTemplate,
    confirmTemplateChange: () => {
      if (!templateChange || templateChange.target !== target) return false;
      return selectTemplate(templateChange.key, true);
    },
    cancelTemplateChange: () => setTemplateChange(null),
    selectPalette,
    setMode: (mode: "light" | "dark") =>
      updateDraft((current) => ({
        ...current,
        selection: { ...current.selection, mode },
      })),
    setSettings: (settingsText: string) =>
      updateDraft((current) => ({ ...current, settingsText })),
    prepare: () => prepare("assign"),
    recover: () => prepare("recover"),
    apply,
    retry,
    discardPlan: () => {
      if (!command.isLocked() && !loading) setPlan(null);
    },
  };
}
