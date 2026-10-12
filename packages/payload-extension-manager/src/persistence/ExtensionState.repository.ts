/**
 * @file packages/payload-extension-manager/src/persistence/ExtensionState.repository.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Атомарно сохраняет strict-codec state/replay и читает dependencies под общими scope locks.
 * @see documentation/specifications/extension-management.md
 */
import { createLocalReq, type Payload, type PayloadRequest } from "payload";
import { hashExtensionValue } from "../appearance/hashExtensionValue.server";
import type {
  ExtensionDependencyStores,
  ExtensionPersistenceLocalApi,
  ExtensionStateCodec,
  ExtensionStateDependencies,
  ExtensionStateMutation,
  ExtensionStateStorageSnapshot,
  LedgerIdentity,
} from "./ExtensionStatePersistence.types";
import { ExtensionAppearanceStorageError } from "./ExtensionAppearanceStorage.error";
import {
  EXTENSION_APPEARANCE_HISTORY_LIMIT,
  EXTENSION_MANAGER_RECEIPTS_SLUG,
  EXTENSION_MANAGER_STATE_SLUG,
} from "./extensionAppearancePersistence.constants";
import {
  assertExtensionDependencies,
  assertExtensionReplay,
  assertExtensionScope,
  extensionReplayKey,
  isMissingExtensionSchema,
  parseExtensionReceiptDocument,
  parseExtensionStateDocument,
  parseStoredExtensionState,
} from "./extensionStateStorage.validator";
import { withExtensionAppearanceTransaction } from "./withExtensionAppearanceTransaction.repository";

/** Collections общие, domain JSON проверяет переданный codec; DTO остаётся у server facade. */
export class ExtensionStateRepository<
  R extends LedgerIdentity,
  S extends { receipts: R[] },
> {
  private readonly api: ExtensionPersistenceLocalApi;
  constructor(
    private readonly payload: Payload,
    private readonly codec: ExtensionStateCodec<R, S>,
  ) {
    this.api = payload as unknown as ExtensionPersistenceLocalApi;
  }

  /** State и bounded apply history читаются согласованно, без потери lifetime ledger. */
  async read(scopeKey: string): Promise<ExtensionStateStorageSnapshot<S>> {
    assertExtensionScope(scopeKey);
    try {
      const req = await createLocalReq({}, this.payload);
      return await withExtensionAppearanceTransaction(
        req,
        scopeKey,
        async () => {
          const stateDocs = await this.findState(req, scopeKey);
          const receipts = await this.api.find({
            collection: EXTENSION_MANAGER_RECEIPTS_SLUG,
            req,
            overrideAccess: true,
            depth: 0,
            limit: EXTENSION_APPEARANCE_HISTORY_LIMIT,
            sort: ["-createdAt", "-id"],
            where: {
              and: [
                { scopeKey: { equals: scopeKey } },
                { kind: { equals: "apply" } },
              ],
            },
          });
          if (!stateDocs.docs.length) {
            if (receipts.docs.length)
              throw new ExtensionAppearanceStorageError(
                "INVALID_STORAGE_STATE",
              );
            return { store: null, storageReady: true };
          }
          const document = parseExtensionStateDocument(
            stateDocs.docs[0],
            scopeKey,
          );
          const store = parseStoredExtensionState(document.state, this.codec);
          store.receipts = receipts.docs.map(
            (doc) =>
              parseExtensionReceiptDocument(doc, scopeKey, this.codec).record,
          );
          return { store: this.codec.parseStore(store), storageReady: true };
        },
      );
    } catch (error) {
      if (isMissingExtensionSchema(error))
        return { store: null, storageReady: false };
      if (error instanceof ExtensionAppearanceStorageError) throw error;
      throw new ExtensionAppearanceStorageError();
    }
  }

  /** Все own/dependency locks предшествуют reads; новый state и immutable receipt коммитятся вместе. */
  async mutate<
    Result,
    D extends ExtensionStateDependencies = Record<never, never>,
  >(
    req: PayloadRequest,
    scopeKey: string,
    bootstrapStore: S,
    operation: ExtensionStateMutation<Result, S, D>,
    replay: LedgerIdentity,
    dependencies?: D,
  ): Promise<Result> {
    assertExtensionScope(scopeKey);
    assertExtensionReplay(replay);
    const declared = dependencies ?? ({} as D);
    assertExtensionDependencies(declared);
    const bootstrap = parseStoredExtensionState(bootstrapStore, this.codec);
    if (req.payload !== this.payload)
      throw new ExtensionAppearanceStorageError();
    const replayKey = extensionReplayKey(scopeKey, replay);
    return withExtensionAppearanceTransaction(
      req,
      scopeKey,
      async () => {
        const [receiptDocs, stateDocs] = await this.storageOperation(
          async () => {
            const receipts = await this.api.find({
              collection: EXTENSION_MANAGER_RECEIPTS_SLUG,
              req,
              overrideAccess: true,
              depth: 0,
              limit: 1,
              where: { replayKey: { equals: replayKey } },
            });
            return [receipts, await this.findState(req, scopeKey)] as const;
          },
        );
        const document = stateDocs.docs.length
          ? parseExtensionStateDocument(stateDocs.docs[0], scopeKey)
          : null;
        const previous = document
          ? parseStoredExtensionState(document.state, this.codec)
          : bootstrap;
        const receipt = receiptDocs.docs.length
          ? parseExtensionReceiptDocument(
              receiptDocs.docs[0],
              scopeKey,
              this.codec,
            ).record
          : null;
        if (
          receipt &&
          (!document ||
            receipt.kind !== replay.kind ||
            receipt.actorKey !== replay.actorKey ||
            receipt.requestId !== replay.requestId)
        )
          throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
        const current = this.codec.parseStore({
          ...previous,
          receipts: receipt ? [receipt] : [],
        });
        // Replay не зависит от испорченного/исчезнувшего dependency state или lazy catalog/bootstrap.
        const snapshots = receipt
          ? (Object.fromEntries(
              Object.keys(declared).map((name) => [name, null]),
            ) as ExtensionDependencyStores<D>)
          : await this.readDependencies(req, declared);
        const outcome = await operation(current, snapshots);
        const next = this.codec.parseStore(outcome.store);
        const produced = next.receipts[0];
        if (
          next.receipts.length !== 1 ||
          !produced ||
          produced.kind !== replay.kind ||
          produced.actorKey !== replay.actorKey ||
          produced.requestId !== replay.requestId
        )
          throw new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE");
        const persisted = { ...next, receipts: [] };
        if (receipt) {
          if (
            hashExtensionValue(receipt) !== hashExtensionValue(produced) ||
            hashExtensionValue(previous) !== hashExtensionValue(persisted)
          )
            throw new ExtensionAppearanceStorageError("IMMUTABLE_RECEIPT");
          return outcome.result;
        }
        await this.storageOperation(async () => {
          if (document)
            await this.api.update({
              collection: EXTENSION_MANAGER_STATE_SLUG,
              id: document.id,
              req,
              overrideAccess: true,
              depth: 0,
              data: { state: persisted },
            });
          else
            await this.api.create({
              collection: EXTENSION_MANAGER_STATE_SLUG,
              req,
              overrideAccess: true,
              depth: 0,
              data: { scopeKey, state: persisted },
            });
          await this.api.create({
            collection: EXTENSION_MANAGER_RECEIPTS_SLUG,
            req,
            overrideAccess: true,
            depth: 0,
            data: {
              replayKey,
              scopeKey,
              kind: produced.kind,
              record: produced,
            },
          });
        });
        return outcome.result;
      },
      Object.values(declared).map((dependency) => dependency.scopeKey),
    );
  }

  private findState(req: PayloadRequest, scopeKey: string) {
    return this.api.find({
      collection: EXTENSION_MANAGER_STATE_SLUG,
      req,
      overrideAccess: true,
      depth: 0,
      limit: 1,
      where: { scopeKey: { equals: scopeKey } },
    });
  }

  /** Metadata кэшируется по scope, но каждый declared codec проверяет свою typed boundary. */
  private async readDependencies<D extends ExtensionStateDependencies>(
    req: PayloadRequest,
    dependencies: D,
  ): Promise<ExtensionDependencyStores<D>> {
    const documents = new Map<string, unknown>();
    const snapshots: Record<string, unknown> = {};
    for (const [name, dependency] of Object.entries(dependencies)) {
      if (!documents.has(dependency.scopeKey)) {
        const found = await this.storageOperation(() =>
          this.findState(req, dependency.scopeKey),
        );
        const document = found.docs.length
          ? parseExtensionStateDocument(found.docs[0], dependency.scopeKey)
          : null;
        documents.set(
          dependency.scopeKey,
          document ? document.state : undefined,
        );
      }
      const state = documents.get(dependency.scopeKey);
      const input =
        state === undefined
          ? typeof dependency.bootstrap === "function"
            ? await dependency.bootstrap()
            : dependency.bootstrap
          : state;
      snapshots[name] = parseStoredExtensionState(input, dependency.codec);
    }
    // Dynamic names неизбежны на Record boundary; значения проверены codec до mapping cast.
    return snapshots as ExtensionDependencyStores<D>;
  }

  private async storageOperation<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ExtensionAppearanceStorageError) throw error;
      throw new ExtensionAppearanceStorageError();
    }
  }
}
