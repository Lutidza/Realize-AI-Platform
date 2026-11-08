/**
 * @file packages/engineering-runtime/test/storage.test.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Проверяет durable SQLite transaction, private binding и реальные межпроцессные workspace leases.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { test } from "node:test";
import type { TestContext } from "node:test";
import {
  openEngineeringStore,
  StorageError,
} from "../src/storage/engineeringStorage.index.ts";
import { assertStorageFilesystem } from "../src/storage/assertStorageFilesystem.policy.ts";
import type {
  EngineeringStore,
  OpenEngineeringStoreInput,
  StorageTransaction,
  StoredOperation,
  WorkspaceLease,
} from "../src/storage/engineeringStorage.index.ts";

const storageUrl = new URL(
  "../src/storage/engineeringStorage.index.ts",
  import.meta.url,
).href;
const errorCode = (code: string) => (error: unknown) =>
  error instanceof StorageError && error.code === code;
const hash = "a".repeat(64);
const at = "2026-10-26T12:00:00.000Z";

function fixture(t: TestContext, limits?: OpenEngineeringStoreInput["limits"]) {
  const fixtureDirectory = join(homedir(), ".cache");
  mkdirSync(fixtureDirectory, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(
    join(fixtureDirectory, "realize-engineering-storage-"),
  );
  const checkoutRoot = join(root, "checkout");
  mkdirSync(checkoutRoot);
  const input: OpenEngineeringStoreInput = {
    stateDirectory: join(root, "state"),
    checkoutRoot,
    installationId: "installation-fixture",
    workspaceId: "workspace-fixture",
    targetId: "target-fixture",
    limits,
  };
  const opened: EngineeringStore[] = [];
  t.after(() => {
    for (const store of opened) store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const open = () => {
    const store = openEngineeringStore(input);
    opened.push(store);
    return store;
  };
  return { root, input, open };
}

test("volatile, network and unknown filesystem types cannot host durable state", (t) => {
  // Linux UAPI: tmpfs, ramfs, NFS, CIFS, SMB2, FUSE, неизвестный type.
  for (const type of [
    0x01021994, 0x858458f6, 0x6969, 0xff534d42, 0xfe534d42, 0x65735546, 0,
  ])
    assert.throws(
      () => assertStorageFilesystem(type),
      errorCode("UNSUPPORTED"),
    );
  const context = fixture(t);
  // Реальный procfs отклоняется до mkdir/open SQLite: дополнительных mount privileges не нужно.
  assert.throws(
    () =>
      openEngineeringStore({
        ...context.input,
        stateDirectory: "/proc/realize-engineering-storage-fixture",
      }),
    errorCode("UNSUPPORTED"),
  );
});

function operation(
  operationId = "operation-fixture",
  revision = 0,
): StoredOperation {
  return {
    operationId,
    revision,
    workspaceId: "workspace-fixture",
    state: "planning",
    writeBlock: null,
    payload: { effects: "none", nested: { value: "initial" } },
  };
}

function insertAll(
  tx: StorageTransaction,
  record = operation(),
  key = "request-fixture",
) {
  tx.insertOperation(record);
  tx.insertRequest({ key, hash, operationId: record.operationId });
  tx.appendEvent({
    operationId: record.operationId,
    revision: record.revision,
    kind: "accepted",
    at,
  });
}

test("transaction persists key, operation, event and epoch together after reopen", (t) => {
  const context = fixture(t);
  const store = context.open();
  store.transaction((tx) => insertAll(tx));
  const epoch = store.binding.epoch;
  const copy = store.getOperation("operation-fixture")!;
  assert.ok(Object.isFrozen(copy));
  assert.ok(Object.isFrozen(copy.payload));
  store.close();
  const reopened = context.open();
  assert.equal(reopened.binding.epoch, epoch);
  assert.deepEqual(reopened.getOperation("operation-fixture"), operation());
  assert.deepEqual(reopened.getRequest("request-fixture"), {
    key: "request-fixture",
    hash,
    operationId: "operation-fixture",
  });
  assert.deepEqual(reopened.listEvents(), [
    {
      operationId: "operation-fixture",
      revision: 0,
      kind: "accepted",
      at,
      seq: 1,
      attempt: null,
      manifestRef: null,
    },
  ]);
  assert.equal(statSync(context.input.stateDirectory).mode & 0o777, 0o700);
  assert.equal(
    statSync(join(context.input.stateDirectory, "journal.sqlite")).mode & 0o777,
    0o600,
  );
});

test("event attempt and manifest remain bound to their recorded revision after reopen", (t) => {
  const context = fixture(t);
  const store = context.open();
  store.transaction((tx) => insertAll(tx));
  store.transaction((tx) => {
    tx.replaceOperation({ ...operation(), revision: 1 }, 0);
    tx.appendEvent({
      operationId: "operation-fixture",
      revision: 1,
      kind: "effect_confirmed",
      at,
      attempt: 2,
      manifestRef: hash,
    });
  });
  store.transaction((tx) => {
    tx.replaceOperation({ ...operation(), revision: 2 }, 1);
    tx.appendEvent({
      operationId: "operation-fixture",
      revision: 2,
      kind: "completed",
      at,
      attempt: 3,
      manifestRef: "b".repeat(64),
    });
  });
  store.close();
  const events = context.open().listEvents({ afterSeq: 1 });
  assert.deepEqual(
    events.map((event) => [event.revision, event.attempt, event.manifestRef]),
    [
      [1, 2, hash],
      [2, 3, "b".repeat(64)],
    ],
  );
});

test("callback failure and stale CAS roll back all command records and outbox", (t) => {
  const store = fixture(t).open();
  assert.throws(
    () =>
      store.transaction((tx) => {
        insertAll(tx);
        throw new Error("fault-before-commit");
      }),
    /fault-before-commit/,
  );
  assert.equal(store.getOperation("operation-fixture"), null);
  assert.equal(store.getRequest("request-fixture"), null);
  assert.deepEqual(store.listEvents(), []);
  store.transaction((tx) => insertAll(tx));
  store.transaction((tx) => {
    tx.replaceOperation({ ...operation(), revision: 1, state: "planned" }, 0);
    tx.appendEvent({
      operationId: "operation-fixture",
      revision: 1,
      kind: "planned",
      at,
    });
  });
  assert.throws(
    () =>
      store.transaction((tx) => {
        tx.insertRequest({
          key: "stale-request",
          hash,
          operationId: "operation-fixture",
        });
        tx.replaceOperation(
          { ...operation(), revision: 1, state: "applying" },
          0,
        );
      }),
    errorCode("CONFLICT"),
  );
  assert.equal(store.getRequest("stale-request"), null);
  assert.equal(store.getOperation("operation-fixture")?.state, "planned");
  assert.equal(store.listEvents().length, 2);
});

test("duplicate keys, thenable callbacks and expired transaction handles cannot mutate journal", async (t) => {
  const store = fixture(t).open();
  store.transaction((tx) => insertAll(tx));
  assert.throws(
    () => store.transaction((tx) => insertAll(tx, operation("second"))),
    errorCode("CONFLICT"),
  );
  assert.equal(store.getOperation("second"), null);
  assert.throws(
    () =>
      store.transaction((tx) => {
        tx.insertOperation(operation("async"));
        return Promise.resolve();
      }),
    errorCode("INVALID_INPUT"),
  );
  assert.equal(store.getOperation("async"), null);
  let captured: StorageTransaction | undefined;
  store.transaction((tx) => {
    captured = tx;
  });
  assert.throws(
    () => captured?.insertOperation(operation("escaped")),
    errorCode("CONFLICT"),
  );
  assert.throws(
    () => store.transaction(() => store.transaction(() => null)),
    errorCode("CONFLICT"),
  );
});

test("payload and durable identity quotas reject atomically without forgetting accepted requests", (t) => {
  const store = fixture(t, {
    maxPayloadBytes: 64,
    maxRequests: 1,
    maxEvents: 1,
  }).open();
  store.transaction((tx) => insertAll(tx));
  assert.throws(
    () =>
      store.transaction((tx) =>
        insertAll(tx, operation("second"), "second-key"),
      ),
    errorCode("LIMIT_EXCEEDED"),
  );
  assert.equal(store.getOperation("second"), null);
  assert.ok(store.getRequest("request-fixture"));
  assert.throws(
    () =>
      store.transaction((tx) =>
        tx.replaceOperation(
          { ...operation(), revision: 1, payload: "x".repeat(65) },
          0,
        ),
      ),
    errorCode("LIMIT_EXCEEDED"),
  );
  assert.throws(
    () =>
      store.transaction((tx) => {
        tx.replaceOperation({ ...operation(), revision: 1 }, 0);
        tx.appendEvent({
          operationId: "operation-fixture",
          revision: 1,
          kind: "planned",
          at,
        });
      }),
    errorCode("LIMIT_EXCEEDED"),
  );
  assert.equal(store.getOperation("operation-fixture")?.revision, 0);
});

test("private binding rejects rebind, checkout state, insecure mode and symlink parents/sidecars", (t) => {
  const context = fixture(t);
  const store = context.open();
  store.close();
  assert.throws(
    () => openEngineeringStore({ ...context.input, targetId: "different" }),
    errorCode("CONFLICT"),
  );
  assert.throws(
    () =>
      openEngineeringStore({
        ...context.input,
        stateDirectory: join(context.input.checkoutRoot, "state"),
      }),
    errorCode("INVALID_INPUT"),
  );
  chmodSync(context.input.stateDirectory, 0o755);
  assert.throws(() => context.open(), errorCode("CONFLICT"));
  chmodSync(context.input.stateDirectory, 0o700);
  const alias = join(context.root, "alias");
  symlinkSync(context.root, alias);
  assert.throws(
    () =>
      openEngineeringStore({
        ...context.input,
        stateDirectory: join(alias, "state"),
      }),
    errorCode("CONFLICT"),
  );
  const victim = join(context.root, "victim");
  writeFileSync(victim, "retained", { mode: 0o600 });
  symlinkSync(
    victim,
    join(context.input.stateDirectory, "journal.sqlite-journal"),
  );
  assert.throws(() => context.open(), errorCode("CONFLICT"));
});

test("finish reserve survives reopen, denies another admission and funds recovery at quota", (t) => {
  const context = fixture(t, { maxRequests: 4, maxEvents: 4 });
  let store = context.open();
  store.transaction((tx) => {
    insertAll(tx);
    tx.reserveFinishCapacity("operation-fixture", {
      events: 3,
      requests: 3,
      bytes: 2048,
    });
  });
  assert.throws(
    () =>
      store.transaction((tx) => insertAll(tx, operation("other"), "other-key")),
    errorCode("LIMIT_EXCEEDED"),
  );
  assert.equal(store.getOperation("other"), null);
  assert.throws(
    () =>
      store.transaction(
        (tx) => {
          tx.appendEvent({
            operationId: "operation-fixture",
            revision: 0,
            kind: "failed-transaction",
            at,
          });
          throw new Error("reserve-rollback");
        },
        { finishOperationId: "operation-fixture" },
      ),
    /reserve-rollback/,
  );
  store.transaction(
    (tx) => {
      tx.replaceOperation(
        {
          ...operation(),
          revision: 1,
          state: "recovery_required",
          writeBlock: "fs_unresolved",
          payload: { retained: "x".repeat(1000) },
        },
        0,
      );
      tx.insertRequest({
        key: "recover-one",
        hash,
        operationId: "operation-fixture",
      });
      tx.appendEvent({
        operationId: "operation-fixture",
        revision: 1,
        kind: "recovery_required",
        at,
      });
    },
    { finishOperationId: "operation-fixture" },
  );
  store.close();
  store = context.open();
  assert.equal(store.listBlockedOperations().length, 1);
  assert.throws(
    () =>
      store.transaction((tx) => insertAll(tx, operation("other"), "other-key")),
    errorCode("LIMIT_EXCEEDED"),
  );
  store.transaction(
    (tx) => {
      tx.replaceOperation(
        { ...operation(), revision: 2, state: "completed" },
        1,
      );
      tx.insertRequest({
        key: "recover-two",
        hash,
        operationId: "operation-fixture",
      });
      tx.appendEvent({
        operationId: "operation-fixture",
        revision: 2,
        kind: "completed",
        at,
      });
      tx.releaseFinishCapacity("operation-fixture");
    },
    { finishOperationId: "operation-fixture" },
  );
  store.transaction((tx) => insertAll(tx, operation("other"), "other-key"));
  assert.equal(store.listEvents().length, 4);
  assert.equal(store.getOperation("operation-fixture")?.state, "completed");
  assert.deepEqual(store.listBlockedOperations(), []);
});

test("reserved payload capacity prevents another operation from using finish bytes", (t) => {
  const store = fixture(t, {
    maxPayloadBytes: 131_072,
    maxDatabaseBytes: 262_144,
  }).open();
  store.transaction((tx) => {
    insertAll(tx);
    tx.reserveFinishCapacity("operation-fixture", {
      events: 1,
      requests: 0,
      bytes: 100_000,
    });
  });
  assert.throws(
    () =>
      store.transaction((tx) =>
        tx.insertOperation({
          ...operation("other"),
          payload: "x".repeat(120_000),
        }),
      ),
    errorCode("LIMIT_EXCEEDED"),
  );
  assert.equal(store.getOperation("other"), null);
  store.transaction(
    (tx) => {
      tx.replaceOperation(
        {
          ...operation(),
          revision: 1,
          state: "completed",
          payload: "x".repeat(90_000),
        },
        0,
      );
      tx.appendEvent({
        operationId: "operation-fixture",
        revision: 1,
        kind: "completed",
        at,
      });
      tx.releaseFinishCapacity("operation-fixture");
    },
    { finishOperationId: "operation-fixture" },
  );
  assert.equal(store.getOperation("operation-fixture")?.state, "completed");
});

test("root or private directory replacement invalidates an open binding", (t) => {
  const context = fixture(t);
  const store = context.open();
  renameSync(
    context.input.checkoutRoot,
    `${context.input.checkoutRoot}-previous`,
  );
  mkdirSync(context.input.checkoutRoot);
  assert.throws(() => store.getRequest("unused"), errorCode("CONFLICT"));
  store.close();
  assert.throws(() => context.open(), errorCode("CONFLICT"));
});

test(
  "workspace leases exclude concurrent processes and release after crash while unresolved journal survives",
  { timeout: 15_000 },
  async (t) => {
    const context = fixture(t);
    const store = context.open();
    store.transaction((tx) =>
      insertAll(tx, {
        ...operation(),
        state: "recovery_required",
        writeBlock: "writer_unconfirmed",
      }),
    );
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
    import { openEngineeringStore } from ${JSON.stringify(storageUrl)};
    const store = openEngineeringStore(JSON.parse(process.env.STORAGE_FIXTURE));
    await store.withWorkspaceLease(async lease => {
      lease.assertHeld();
      process.send({ ready: true });
      await new Promise(resolve => process.on('message', resolve));
    });
    store.close();
  `,
      ],
      {
        env: { ...process.env, STORAGE_FIXTURE: JSON.stringify(context.input) },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      },
    );
    const exit = once(child, "exit");
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    });
    await Promise.race([
      once(child, "message"),
      exit.then(() => {
        throw new Error("lock child exited before ready");
      }),
    ]);
    await assert.rejects(
      store.withWorkspaceLease(async () => undefined),
      errorCode("CONFLICT"),
    );
    child.kill("SIGKILL");
    await exit;
    let expired: WorkspaceLease | undefined;
    await store.withWorkspaceLease(async (lease) => {
      expired = lease;
      lease.assertHeld();
    });
    assert.throws(() => expired?.assertHeld());
    store.close();
    const reopened = context.open();
    assert.equal(
      reopened.listBlockedOperations()[0]?.writeBlock,
      "writer_unconfirmed",
    );
    assert.equal(
      reopened.getRequest("request-fixture")?.operationId,
      "operation-fixture",
    );
  },
);

test(
  "process death before COMMIT leaves no request, operation or event",
  { timeout: 15_000 },
  async (t) => {
    const context = fixture(t);
    context.open().close();
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
    import { openEngineeringStore } from ${JSON.stringify(storageUrl)};
    const store = openEngineeringStore(JSON.parse(process.env.STORAGE_FIXTURE));
    store.transaction(tx => {
      tx.insertOperation(${JSON.stringify(operation())});
      tx.insertRequest({ key: 'request-fixture', hash: '${hash}', operationId: 'operation-fixture' });
      tx.appendEvent({ operationId: 'operation-fixture', revision: 0, kind: 'accepted', at: '${at}' });
      process.kill(process.pid, 'SIGKILL');
    });
  `,
      ],
      {
        env: { ...process.env, STORAGE_FIXTURE: JSON.stringify(context.input) },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    const [code, signal] = await once(child, "exit");
    assert.equal(code, null);
    assert.equal(signal, "SIGKILL");
    const reopened = context.open();
    assert.equal(reopened.getOperation("operation-fixture"), null);
    assert.equal(reopened.getRequest("request-fixture"), null);
    assert.deepEqual(reopened.listEvents(), []);
  },
);
