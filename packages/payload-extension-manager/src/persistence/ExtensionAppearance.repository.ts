/**
 * @file packages/payload-extension-manager/src/persistence/ExtensionAppearance.repository.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Сохраняет прежний appearance API через общий strict-codec state/immutable replay kernel.
 * @see documentation/specifications/extension-management.md
 */
import type { Payload, PayloadRequest } from "payload";
import type {
  ExtensionAppearanceReceipt,
  ExtensionAppearanceStore,
} from "../appearance/ExtensionAppearance.types";
import type {
  ExtensionAppearanceMutation,
  ExtensionAppearanceReplay,
  ExtensionAppearanceStorageSnapshot,
} from "./ExtensionAppearancePersistence.types";
import { ExtensionStateRepository } from "./ExtensionState.repository";
import { extensionAppearanceStateCodec } from "./extensionAppearanceStateCodec.validator";

/** Existing scopes, JSON shape, fingerprints, signatures и error semantics не меняются. */
export class ExtensionAppearanceRepository {
  private readonly repository: ExtensionStateRepository<
    ExtensionAppearanceReceipt,
    ExtensionAppearanceStore
  >;
  constructor(payload: Payload) {
    this.repository = new ExtensionStateRepository(
      payload,
      extensionAppearanceStateCodec,
    );
  }
  read(scopeKey: string): Promise<ExtensionAppearanceStorageSnapshot> {
    return this.repository.read(scopeKey);
  }
  mutate<Result>(
    req: PayloadRequest,
    scopeKey: string,
    bootstrapStore: ExtensionAppearanceStore,
    operation: ExtensionAppearanceMutation<Result>,
    replay: ExtensionAppearanceReplay,
  ): Promise<Result> {
    return this.repository.mutate(
      req,
      scopeKey,
      bootstrapStore,
      operation,
      replay,
    );
  }
}
