/**
 * @file src/components/admin/access-tokens/useAccessCreateForm.hook.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Ведёт черновик ограниченного API или личного доступа и проверяет package контракт.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import { useState } from "react";
import { accessCreateSchema } from "@realize/payload-access-management/contracts";
import type {
  AccessCreateInput,
  AccessScope,
} from "@realize/payload-access-management/contracts";

export function useAccessCreateForm(
  onCreate: (input: AccessCreateInput) => Promise<boolean>,
) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccessCreateInput["kind"]>("personal");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [scopes, setScopes] = useState<AccessScope[]>(["task-manager:read"]);
  const [error, setError] = useState<string | null>(null);
  const toggleScope = (scope: AccessScope, checked: boolean) => {
    if (scope === "task-manager:read") return;
    setScopes((previous) =>
      checked
        ? [...new Set([...previous, scope])]
        : previous.filter((value) => value !== scope),
    );
  };
  const submit = async () => {
    const parsed = accessCreateSchema.safeParse({
      name,
      kind,
      expiresInDays: Number(expiresInDays),
      scopes,
    });
    if (!parsed.success) {
      setError("Укажите название, права и срок от 1 до 365 дней.");
      return;
    }
    setError(null);
    await onCreate(parsed.data);
  };
  return {
    name,
    setName,
    kind,
    setKind,
    expiresInDays,
    setExpiresInDays,
    scopes,
    toggleScope,
    error,
    submit,
  };
}
