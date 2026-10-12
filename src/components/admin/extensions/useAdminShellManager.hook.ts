/**
 * @file src/components/admin/extensions/useAdminShellManager.hook.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Сохраняет независимый shell draft, проверяет план и повторяет frozen команды без навигации.
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdminShellMode,
  AdminShellSnapshotDto,
  AdminShellPlanDto,
  AdminShellReceiptDto,
  ExtensionManagerSnapshotDto,
} from "@realize/payload-extension-manager/contracts";
import { AdminShellApi } from "./AdminShellApi.adapter";
import type {
  AdminShellCommandInput,
  AdminShellCommandResult,
  AdminShellTransport,
} from "./AdminShellPicker.types";
import type { ExtensionMutationLock } from "./ExtensionMutation.types";
import { useExtensionMutation } from "./useExtensionMutation.hook";

export function useAdminShellManager(
  appearance: ExtensionManagerSnapshotDto | null,
  lock?: ExtensionMutationLock,
  transport?: AdminShellTransport,
) {
  const [api] = useState(() => transport ?? new AdminShellApi());
  const command = useExtensionMutation<
    AdminShellCommandInput,
    AdminShellCommandResult
  >(
    async (input, requestId) =>
      input.kind === "prepare"
        ? { kind: "prepare", data: await api.prepare(input.input, requestId) }
        : { kind: "apply", data: await api.apply(input.input, requestId) },
    lock,
  );
  const [snapshot, setSnapshot] = useState<AdminShellSnapshotDto | null>(null);
  const [draft, setDraft] = useState<AdminShellMode | null>(null);
  const [plan, setPlan] = useState<AdminShellPlanDto | null>(null);
  const [receipt, setReceipt] = useState<AdminShellReceiptDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now);
  const mounted = useRef(true);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const value = await api.snapshot();
      if (!mounted.current || current !== generation.current) return;
      setSnapshot(value);
      setDraft((existing) => existing ?? value.state.current);
      setLoadError(null);
    } catch (cause) {
      if (mounted.current && current === generation.current)
        setLoadError(
          cause instanceof Error
            ? cause.message
            : "Не удалось загрузить варианты оболочки.",
        );
    } finally {
      if (mounted.current && current === generation.current) setLoading(false);
    }
  }, [api]);
  const refresh = () => {
    setLoading(true);
    return load();
  };
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(load);
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [load]);
  useEffect(() => {
    if (!plan) return;
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.min(
        Math.max(0, Date.parse(plan.expiresAt) - Date.now()) + 10,
        2147483647,
      ),
    );
    return () => window.clearTimeout(timer);
  }, [plan]);

  const canManage =
    snapshot?.storage === "ready" && snapshot.permissions.manageShell;
  const locked = loading || command.locked;
  const invalidPlanReason =
    !plan || !snapshot
      ? null
      : Date.parse(plan.expiresAt) <= clock
        ? "Срок плана истёк. Подготовьте новый план."
        : plan.expectedRevision !== snapshot.state.revision ||
            plan.policyHash !== snapshot.policyHash
          ? "Назначение или доступность оболочек изменились. Подготовьте новый план."
          : plan.templateBinding &&
              (!appearance ||
                plan.templateBinding.appearanceRevision !==
                  appearance.targets.admin.revision ||
                plan.templateBinding.catalogHash !==
                  appearance.catalog.catalogHash)
            ? "Оформление Admin изменилось. Подготовьте новый план оболочки."
            : !snapshot.policy.enabled[plan.desiredMode]
              ? "Выбранная оболочка недоступна. Подготовьте новый план."
              : null;

  async function accept(result: AdminShellCommandResult | undefined) {
    if (!result || !mounted.current) return;
    if (result.kind === "prepare") {
      setClock(Date.now());
      setPlan(result.data.plan);
      setReceipt(null);
    } else {
      setPlan(null);
      setReceipt(result.data.receipt);
      await refresh();
    }
  }
  async function prepare(action: "select" | "recover") {
    if (!snapshot || !canManage || loading || command.isLocked()) return;
    const common = {
      expectedRevision: snapshot.state.revision,
      expectedPolicyHash: snapshot.policyHash,
    };
    if (action === "recover") {
      if (
        snapshot.state.previous &&
        snapshot.policy.enabled[snapshot.state.previous]
      )
        await accept(
          await command.start({
            kind: "prepare",
            input: { action, ...common },
          }),
        );
    } else if (draft && snapshot.policy.enabled[draft]) {
      await accept(
        await command.start({
          kind: "prepare",
          input: { action, mode: draft, ...common },
        }),
      );
    }
  }
  return {
    snapshot,
    draft,
    plan,
    receipt,
    loading,
    loadError,
    locked,
    canManage,
    invalidPlanReason,
    pending: command.pending,
    commandError: command.error,
    refresh,
    select: (mode: AdminShellMode) => {
      if (loading || command.isLocked() || !snapshot?.policy.enabled[mode])
        return;
      setDraft(mode);
      setPlan(null);
      setReceipt(null);
    },
    prepare: () => prepare("select"),
    recover: () => prepare("recover"),
    apply: async () => {
      if (
        !plan ||
        !canManage ||
        loading ||
        command.isLocked() ||
        invalidPlanReason ||
        Date.parse(plan.expiresAt) <= Date.now()
      )
        return;
      await accept(
        await command.start({
          kind: "apply",
          input: { planId: plan.planId, expectedPlanHash: plan.planHash },
        }),
      );
    },
    retry: async () => {
      await accept(await command.retry());
    },
    discardPlan: () => {
      if (!loading && !command.isLocked()) setPlan(null);
    },
  };
}
