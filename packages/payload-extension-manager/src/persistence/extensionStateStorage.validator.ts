/**
 * @file packages/payload-extension-manager/src/persistence/extensionStateStorage.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет общие private metadata и strict codec state/ledger без знания domain JSON.
 * @see documentation/specifications/extension-management.md
 */
import {
  extensionActorKeySchema,
  extensionRequestIdSchema,
} from "../appearance/extensionAppearance.schemas";
import { hashExtensionValue } from "../appearance/hashExtensionValue.server";
import type {
  ExtensionStateCodec,
  LedgerIdentity,
  ExtensionReceiptDocument,
  ExtensionStateDocument,
  ExtensionStateDependencies,
} from "./ExtensionStatePersistence.types";
import { ExtensionAppearanceStorageError } from "./ExtensionAppearanceStorage.error";

/** Opaque server scopes никогда не интерполируются в SQL. */
export function assertExtensionScope(scopeKey: string): void {
  if (
    typeof scopeKey !== "string" ||
    scopeKey.length < 1 ||
    scopeKey.length > 256 ||
    scopeKey.trim() !== scopeKey ||
    /[\u0000-\u001f\u007f]/.test(scopeKey)
  )
    throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
}
export function assertExtensionReplay(replay: LedgerIdentity): void {
  if (
    !extensionActorKeySchema.safeParse(replay.actorKey).success ||
    !extensionRequestIdSchema.safeParse(replay.requestId).success ||
    !["prepare", "apply"].includes(replay.kind)
  )
    throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
}

/** Сохраняет canonical replay hash прежнего appearance adapter. */
export function extensionReplayKey(
  scopeKey: string,
  replay: LedgerIdentity,
): string {
  return hashExtensionValue([
    scopeKey,
    replay.actorKey,
    replay.kind,
    replay.requestId,
  ]);
}

export function assertExtensionDependencies(
  dependencies: ExtensionStateDependencies,
): void {
  if (Object.keys(dependencies).length > 8)
    throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
  for (const [name, dependency] of Object.entries(dependencies)) {
    if (
      !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ||
      ["constructor", "prototype", "__proto__"].includes(name)
    )
      throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
    assertExtensionScope(dependency.scopeKey);
  }
}

export function parseExtensionStateDocument(
  input: unknown,
  scopeKey: string,
): ExtensionStateDocument {
  if (
    !input ||
    typeof input !== "object" ||
    !("id" in input) ||
    !("scopeKey" in input) ||
    !("state" in input) ||
    !validDocumentId(input.id) ||
    input.scopeKey !== scopeKey
  )
    throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
  return { id: input.id, scopeKey, state: input.state };
}

/** В JSON state нет сохранённых receipts: ledger имеет отдельного immutable owner. */
export function parseStoredExtensionState<
  R extends LedgerIdentity,
  S extends { receipts: R[] },
>(input: unknown, codec: ExtensionStateCodec<R, S>): S {
  try {
    const store = codec.parseStore(input);
    if (store.receipts.length)
      throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
    return store;
  } catch {
    throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
  }
}

export function parseExtensionReceiptDocument<
  R extends LedgerIdentity,
  S extends { receipts: R[] },
>(
  input: unknown,
  scopeKey: string,
  codec: ExtensionStateCodec<R, S>,
): ExtensionReceiptDocument<R> {
  try {
    if (
      !input ||
      typeof input !== "object" ||
      !("id" in input) ||
      !("scopeKey" in input) ||
      !("kind" in input) ||
      !("replayKey" in input) ||
      !("record" in input) ||
      !validDocumentId(input.id) ||
      input.scopeKey !== scopeKey
    )
      throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
    const record = codec.parseReceipt(input.record);
    assertExtensionReplay(record);
    if (
      record.kind !== input.kind ||
      input.replayKey !== extensionReplayKey(scopeKey, record)
    )
      throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
    return {
      id: input.id,
      scopeKey,
      replayKey: input.replayKey,
      kind: record.kind,
      record,
    };
  } catch {
    throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
  }
}

/** Только SQLSTATE42P01 обозначает отсутствующую migration; другие driver errors fail closed. */
export function isMissingExtensionSchema(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  for (
    let depth = 0;
    depth < 8 && current && typeof current === "object" && !seen.has(current);
    depth += 1
  ) {
    seen.add(current);
    if ("code" in current && current.code === "42P01") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
function validDocumentId(input: unknown): input is string | number {
  return (
    (typeof input === "string" && input.length > 0) ||
    (typeof input === "number" && Number.isSafeInteger(input) && input > 0)
  );
}
