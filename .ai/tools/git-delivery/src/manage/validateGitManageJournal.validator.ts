/**
 * @file .ai/tools/git-delivery/src/manage/validateGitManageJournal.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет persisted before/after журнала без назначения новой цели mutation.
 */
import { PolicyError } from "../Policy.error.ts";
import type { GitManageJournal, GitManageState } from "./GitManage.types.ts";

function invalid(): never {
  throw new PolicyError(
    "invalid_journal",
    "Журнал manage повреждён или принадлежит другой операции.",
  );
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    invalid();
  return value as Record<string, unknown>;
}
function state(input: unknown): GitManageState {
  const value = record(input, ["head", "branch", "target"]);
  if (
    typeof value.head !== "string" ||
    !/^[a-f0-9]{40}$/.test(value.head) ||
    (value.branch !== null &&
      (typeof value.branch !== "string" ||
        value.branch.length > 240 ||
        /[\0\r\n]/.test(value.branch))) ||
    !Array.isArray(value.target) ||
    value.target.length > 200 ||
    value.target.some(
      (item) =>
        typeof item !== "string" ||
        Buffer.byteLength(item) > 16384 ||
        item.includes("\0"),
    )
  )
    invalid();
  return {
    head: value.head,
    branch: value.branch as string | null,
    target: [...value.target] as string[],
  };
}

export function validateGitManageJournal(input: unknown): GitManageJournal {
  const value = record(input, [
    "version",
    "kind",
    "binding",
    "phase",
    "before",
    "after",
  ]);
  if (
    value.version !== 1 ||
    value.kind !== "manage" ||
    typeof value.binding !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.binding) ||
    !["prepared", "completed"].includes(String(value.phase))
  )
    invalid();
  return {
    version: 1,
    kind: "manage",
    binding: value.binding,
    phase: value.phase as "prepared" | "completed",
    before: state(value.before),
    after: state(value.after),
  };
}
