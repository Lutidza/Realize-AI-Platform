/**
 * @file packages/payload-extension-manager/src/admin-shell/readAdminShellState.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Разрешает effective shell и отдельный fallback без переписывания сохранённого выбора.
 * @see documentation/specifications/extension-management.md
 */
import type {
  AdminShellMode,
  ReadAdminShellStateInput,
  ReadAdminShellStateResult,
} from "./AdminShell.types";
import { parseAdminShellStore } from "./parseAdminShellStore.validator";
import { parseAdminShellPolicy } from "./parseAdminShellPolicy.validator";
import { captureAdminShellTemplate } from "./captureAdminShellTemplate.validator";

export function readAdminShellState(
  input: ReadAdminShellStateInput,
): ReadAdminShellStateResult {
  const store = parseAdminShellStore(input.store);
  const policy = parseAdminShellPolicy(input.policy);
  const available = (mode: AdminShellMode): boolean => {
    if (!policy.enabled[mode]) return false;
    if (mode === "native") return true;
    try {
      captureAdminShellTemplate(input.appearance);
      return true;
    } catch {
      return false;
    }
  };
  if (available(store.state.current))
    return {
      state: store.state,
      effectiveMode: store.state.current,
      requiresRecovery: false,
      fallbackReason: null,
    };
  const fallback = [
    policy.fallbackMode,
    policy.defaultMode,
    "native",
    "template",
  ] as const;
  return {
    state: store.state,
    effectiveMode: fallback.find(available) ?? null,
    requiresRecovery: true,
    fallbackReason: policy.enabled[store.state.current]
      ? "template_unavailable"
      : "policy_disabled",
  };
}
