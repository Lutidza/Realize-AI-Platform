/**
 * @file .ai/tools/task-workspace/test/remoteWorkspaceRouting.test.mjs
 * @version 1.2.2
 * @date 2026-11-26
 * @description Проверяет владение задачей, crash recovery, неизменность retry и конкурентную передачу без настоящего сервера.
 * @see documentation/specifications/task-management-execution.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { WorkspaceFs } from "../src/filesystem/WorkspaceFs.adapter.mjs";
import { WorkspaceError } from "../src/Workspace.error.mjs";
import { runWorkspaceCommand } from "../src/cli/runWorkspaceCommand.controller.mjs";
import { runRemoteFirstWorkspaceCommand } from "../src/remote/runRemoteFirstWorkspaceCommand.controller.mjs";
import {
  readRemoteWorkspaceRecord,
  remoteWorkspaceRecordPath,
} from "../src/remote/RemoteWorkspace.repository.mjs";
import { readRemoteWorkspaceConfig } from "../src/remote/readRemoteWorkspaceConfig.adapter.mjs";
import {
  fixture as authFixture,
  credential as authCredential,
  baseUrl as authBaseUrl,
} from "./authTest.fixture.mjs";
import { readDossier } from "../src/dossier/Dossier.repository.mjs";
import { updateDossier } from "../src/dossier/updateDossier.service.mjs";
import {
  beginWorkspaceProducerGroup,
  finalizeWorkspaceProducerGroup,
} from "../src/producer-group/workspaceProducerGroup.index.mjs";
import { withWorkspaceFileLock } from "../src/filesystem/withWorkspaceFileLock.adapter.mjs";

const key = "remote-test";
const env = {
  REALIZE_TASK_MANAGER_URL: "http://localhost:3000/api/task-manager",
  REALIZE_TASK_MANAGER_TOKEN: "private-test-token",
};
const selectors = {
  project: "11111111-1111-4111-8111-111111111111",
  list: "22222222-2222-4222-8222-222222222222",
};
/** @type {import('../src/remote/RemoteWorkspace.types').RemoteWorkspacePreflight} */
const ready = async (config, selection) => ({
  kind: "ready",
  reason: null,
  target: {
    baseUrl: config.baseUrl,
    projectId: selection.projectId,
    listId: selection.listId ?? selectors.list,
  },
});
/** @param {import('node:test').TestContext} context */
function fixture(context) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "realize-remote-routing-"),
  );
  const storage = new WorkspaceFs(root);
  context.after(() => {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  /** @param {import('../src/cli/WorkspaceCommand.types').WorkspaceCommandRequest} command @param {Parameters<typeof runRemoteFirstWorkspaceCommand>[4]} [options] */
  const run = (command, options = { env: {} }) =>
    runRemoteFirstWorkspaceCommand(
      storage,
      command,
      runWorkspaceCommand,
      {},
      { ...options, auth: options.auth ?? authFixture().deps },
    );
  /** @type {Map<string, { id: number, taskId: string }>} */
  const taskRows = new Map();
  /** @param {import('@realize/payload-task-manager/contracts').TaskWorkspaceCreateInput} payload @param {number} [revision]
   * @returns {import('../src/remote/RemoteWorkspace.types').RemoteWorkspaceTransportResult}
   */
  function success(payload, revision = 1) {
    const { clientTaskId, ...fields } = payload;
    let row = taskRows.get(clientTaskId);
    if (!row) {
      row = { id: taskRows.size + 1, taskId: randomUUID() };
      taskRows.set(clientTaskId, row);
    }
    return {
      kind: "success",
      data: {
        disposition: "created",
        task: {
          ...fields,
          id: row.taskId,
          key: `TASK-${row.id}`,
          revision,
          createdBy: "actor",
          updatedBy: "actor",
          createdAt: "2026-10-19T00:00:00.000Z",
          updatedAt: "2026-10-19T00:00:00.000Z",
        },
      },
    };
  }
  return { storage, root, run, success, taskRows };
}
/** @returns {import('../src/cli/WorkspaceCommand.types').WorkspaceCommandRequest} */
const create = () => ({
  action: "create",
  flags: { task: key, title: "Test task", ...selectors },
});
/** @returns {import('../src/cli/WorkspaceCommand.types').WorkspaceCommandRequest} */
const sync = () => ({ action: "sync", flags: { task: key, ...selectors } });
/** @param {string} code */
const codeIs = (code) => (/** @type {unknown} */ error) =>
  error instanceof WorkspaceError && error.code === code;

test("expired bearer plus proven offline refresh still allows local task fallback without losing keyring", async (context) => {
  const f = fixture(context);
  const auth = authFixture();
  auth.select(authBaseUrl);
  auth.stored.set(authBaseUrl, authCredential(-1));
  auth.deps.transport = async () => {
    throw new WorkspaceError("auth_preconnect_unavailable");
  };
  const output = await f.run(create(), {
    env: {},
    auth: auth.deps,
    preflight: async (config) => {
      assert.equal(config.token, authCredential(-1).accessToken);
      return { kind: "unavailable", reason: "remote_econnrefused" };
    },
    transport: async () => {
      throw new Error("POST must not run offline");
    },
  });
  assert.equal(/** @type {{backend:string}} */ (output).backend, "local");
  assert.ok(readDossier(f.storage, key).meta);
  assert.equal(
    auth.stored.get(authBaseUrl)?.refreshToken,
    authCredential(-1).refreshToken,
  );
  assert.equal(auth.pending.has(authBaseUrl), false);
});

test("restored server rejecting expired bearer does not turn refresh refusal into local fallback", async (context) => {
  const f = fixture(context);
  const auth = authFixture();
  auth.select(authBaseUrl);
  auth.stored.set(authBaseUrl, authCredential(-1));
  auth.deps.transport = async () => {
    throw new WorkspaceError("auth_preconnect_unavailable");
  };
  await assert.rejects(
    f.run(create(), {
      env: {},
      auth: auth.deps,
      preflight: async () => ({ kind: "rejected", reason: "remote_http_401" }),
    }),
    codeIs("remote_http_401"),
  );
  assert.throws(() => readDossier(f.storage, key));
  assert.equal(auth.stored.size, 1);
});

test("remote config distinguishes absent, incomplete, unsafe and valid loopback/HTTPS", () => {
  const credentialUrl = new URL("https://example.com/api/task-manager");
  credentialUrl.username = "user";
  credentialUrl.password = "secret";
  assert.equal(readRemoteWorkspaceConfig({}), null);
  for (const invalid of [
    { REALIZE_TASK_MANAGER_TOKEN: "secret" },
    { ...env, REALIZE_TASK_MANAGER_URL: undefined },
    { ...env, REALIZE_TASK_MANAGER_URL: "http://example.com/api/task-manager" },
    {
      ...env,
      REALIZE_TASK_MANAGER_URL: credentialUrl.toString(),
    },
    {
      ...env,
      REALIZE_TASK_MANAGER_URL:
        "https://example.com/api/task-manager?token=secret",
    },
    { ...env, REALIZE_TASK_MANAGER_TOKEN: "a\nb" },
  ])
    assert.throws(() => readRemoteWorkspaceConfig(invalid), /./);
  assert.ok(readRemoteWorkspaceConfig(env));
  assert.ok(
    readRemoteWorkspaceConfig({
      ...env,
      REALIZE_TASK_MANAGER_URL: "https://example.com/api/task-manager",
    }),
  );
});

test("remote success journals exact request before HTTP without any dossier and inspect is read-only", async (context) => {
  const f = fixture(context);
  let count = 0;
  await f.run(create(), {
    env,
    preflight: ready,
    transport: async (config, payload) => {
      count++;
      assert.equal(config.token, env.REALIZE_TASK_MANAGER_TOKEN);
      const durable = readRemoteWorkspaceRecord(f.storage, key);
      assert.equal(durable?.phase, "pending");
      assert.deepEqual(durable?.payload, payload);
      withWorkspaceFileLock(f.storage, key, () => assert.ok(true));
      assert.ok(!f.storage.exists(".ai-workspace"));
      return f.success(payload);
    },
  });
  assert.equal(count, 1);
  assert.equal(readRemoteWorkspaceRecord(f.storage, key)?.phase, "remote");
  assert.ok(!f.storage.exists(".ai-workspace"));
  const before = f.storage.read(remoteWorkspaceRecordPath(key));
  const inspected = await f.run(
    { action: "inspect", flags: { task: key } },
    { env: { REALIZE_TASK_MANAGER_URL: "invalid" } },
  );
  assert.equal(
    /** @type {{ownership:string}} */ (inspected).ownership,
    "remote",
  );
  assert.deepEqual(f.storage.read(remoteWorkspaceRecordPath(key)), before);
  assert.ok(!before.includes(env.REALIZE_TASK_MANAGER_TOKEN));
});

test("offline create is idempotent, returns current revision and concurrent retries preserve identity", async (context) => {
  const f = fixture(context);
  await f.run(create());
  const original = readDossier(f.storage, key).meta;
  assert.ok(original);
  assert.equal(
    original.localDossierId,
    readRemoteWorkspaceRecord(f.storage, key)?.clientTaskId,
  );
  updateDossier(f.storage, key, original.revision, { category: "active" });
  const repeated = await f.run(create());
  assert.equal(/** @type {{revision:number}} */ (repeated).revision, 2);
  await Promise.all([f.run(create()), f.run(create())]);
  const current = readDossier(f.storage, key).meta;
  assert.equal(current?.localDossierId, original.localDossierId);
  assert.equal(current?.revision, 2);
  await assert.rejects(
    f.run({ action: "create", flags: { task: key, title: "changed" } }),
    codeIs("remote_create_conflict"),
  );
});

test("preflight unavailable creates fallback; rejected preflight never creates TASK", async (context) => {
  for (const kind of ["unavailable", "rejected"]) {
    const f = fixture(context);
    const action = f.run(create(), {
      env,
      preflight: async () => ({
        kind: /** @type {'unavailable'|'rejected'} */ (kind),
        reason:
          kind === "unavailable"
            ? "remote_application_unavailable"
            : "remote_http_401",
      }),
      transport: async () => {
        throw Error("POST forbidden");
      },
    });
    if (kind === "rejected")
      await assert.rejects(action, codeIs("remote_http_401"));
    else await action;
    assert.equal(
      f.storage.exists(`.ai-workspace/tasks/${key}/TASK.md`),
      kind === "unavailable",
    );
    assert.equal(readRemoteWorkspaceRecord(f.storage, key)?.phase, "queued");
  }
});

test("unknown POST outcome freezes edits, rejects changed target and replays exact payload on sync", async (context) => {
  const f = fixture(context);
  await assert.rejects(
    f.run(create(), {
      env,
      preflight: ready,
      transport: async () => ({ kind: "pending", reason: "remote_timeout" }),
    }),
    codeIs("remote_sync_pending"),
  );
  const pending = readRemoteWorkspaceRecord(f.storage, key);
  assert.ok(pending?.payload);
  assert.ok(!f.storage.exists(".ai-workspace"));
  assert.throws(
    () => updateDossier(f.storage, key, 1, { category: "active" }),
    codeIs("remote_sync_pending"),
  );
  await assert.rejects(
    f.run(
      {
        action: "sync",
        flags: { task: key, project: selectors.project, list: randomUUID() },
      },
      {
        env,
        transport: async () => {
          throw Error("must not send");
        },
      },
    ),
    codeIs("remote_target_conflict"),
  );
  await f.run(sync(), {
    env,
    preflight: async () => {
      throw Error("pending must skip preflight");
    },
    transport: async (_config, payload) => {
      assert.deepEqual(payload, pending.payload);
      return f.success(payload);
    },
  });
  assert.equal(
    readRemoteWorkspaceRecord(f.storage, key)?.clientTaskId,
    pending.clientTaskId,
  );
  assert.ok(!f.storage.exists(".ai-workspace"));
});

test("first proven refused POST falls back; refusal after unknown POST stays pending", async (context) => {
  const first = fixture(context);
  await first.run(create(), {
    env,
    preflight: ready,
    transport: async () => ({
      kind: "unavailable",
      reason: "remote_econnrefused",
    }),
  });
  assert.equal(readRemoteWorkspaceRecord(first.storage, key)?.phase, "queued");
  assert.ok(first.storage.exists(`.ai-workspace/tasks/${key}/TASK.md`));
  const second = fixture(context);
  await assert.rejects(
    second.run(create(), {
      env,
      preflight: ready,
      transport: async () => ({
        kind: "pending",
        reason: "remote_network_ambiguous",
      }),
    }),
    codeIs("remote_sync_pending"),
  );
  await assert.rejects(
    second.run(sync(), {
      env,
      transport: async () => ({
        kind: "unavailable",
        reason: "remote_econnrefused",
      }),
    }),
    codeIs("remote_sync_pending"),
  );
  assert.ok(!second.storage.exists(".ai-workspace"));
});

test("queued auto handoff preserves snapshot and stops requested local mutation after success", async (context) => {
  const f = fixture(context);
  await f.run(create());
  const before = f.storage.read(`.ai-workspace/tasks/${key}/TASK.md`);
  f.storage.writeJson("status.json", { category: "active" });
  await assert.rejects(
    f.run(
      {
        action: "status",
        flags: { task: key, "expected-revision": 1, input: "status.json" },
      },
      {
        env,
        preflight: ready,
        transport: async (_config, payload) => f.success(payload),
      },
    ),
    codeIs("remote_owned"),
  );
  assert.deepEqual(
    f.storage.read(`.ai-workspace/tasks/${key}/TASK.md`),
    before,
  );
  assert.equal(readRemoteWorkspaceRecord(f.storage, key)?.phase, "remote");
  assert.throws(
    () => updateDossier(f.storage, key, 1, { category: "active" }),
    codeIs("remote_owned"),
  );
});

test("legacy and unqueued existing dossiers are not imported implicitly", async (context) => {
  const f = fixture(context);
  f.storage.write(`.ai-workspace/tasks/${key}/TASK.md`, "# Legacy\n");
  await assert.rejects(
    f.run(sync(), { env }),
    codeIs("legacy_requires_adoption"),
  );
  await f.run(
    {
      action: "adopt",
      flags: { task: key, title: "Legacy", category: "open" },
    },
    {
      env,
      transport: async () => {
        throw Error("must not import");
      },
    },
  );
  assert.equal(readRemoteWorkspaceRecord(f.storage, key), null);
  assert.equal(readDossier(f.storage, key).body, "# Legacy\n");
});

test("crash before HTTP and lost acknowledgement recover through same durable clientTaskId", async (context) => {
  const f = fixture(context);
  await assert.rejects(
    f.run(create(), {
      env,
      preflight: ready,
      transport: async () => {
        throw Error("simulated process loss");
      },
    }),
    /simulated process loss/,
  );
  const before = readRemoteWorkspaceRecord(f.storage, key);
  assert.ok(before);
  const original = f.storage.writeJson.bind(f.storage);
  f.storage.writeJson = (file, value, exclusive) => {
    if (/** @type {{phase?:string}} */ (value)?.phase === "remote")
      throw Error("simulated ACK persistence failure");
    return original(file, value, exclusive);
  };
  await assert.rejects(
    f.run(sync(), {
      env,
      transport: async (_config, payload) => f.success(payload),
    }),
    /ACK persistence/,
  );
  const row = f.taskRows.get(before.clientTaskId);
  assert.ok(row);
  f.storage.writeJson = original;
  await f.run(create(), {
    env,
    transport: async (_config, payload) => {
      assert.equal(payload.clientTaskId, before.clientTaskId);
      const replay = f.success(payload, 2);
      assert.equal(replay.kind, "success");
      assert.equal(replay.data.task.key, `TASK-${row.id}`);
      return replay;
    },
  });
  assert.equal(
    readRemoteWorkspaceRecord(f.storage, key)?.taskRef?.id,
    row.taskId,
  );
  assert.equal(readRemoteWorkspaceRecord(f.storage, key)?.taskRef?.revision, 2);
  assert.ok(!f.storage.exists(".ai-workspace"));
});

test("failure to persist prepared POST prevents HTTP and dossier creation", async (context) => {
  const f = fixture(context);
  const write = f.storage.writeJson.bind(f.storage);
  f.storage.writeJson = (file, value, exclusive) => {
    if (/** @type {{phase?:string}} */ (value)?.phase === "pending")
      throw Error("disk failure");
    return write(file, value, exclusive);
  };
  await assert.rejects(
    f.run(create(), {
      env,
      preflight: ready,
      transport: async () => {
        throw Error("HTTP forbidden");
      },
    }),
    /disk failure/,
  );
  assert.ok(!f.storage.exists(".ai-workspace"));
  assert.equal(readRemoteWorkspaceRecord(f.storage, key)?.phase, "queued");
});

test("concurrent dispatches share identity; refused contender cannot downgrade another unknown attempt", async (context) => {
  const f = fixture(context);
  /** @type {((value:import('../src/remote/RemoteWorkspace.types').RemoteWorkspaceTransportResult)=>void)[]} */
  const releases = [];
  /** @type {import('../src/remote/RemoteWorkspace.types').RemoteWorkspaceTransport} */
  const transport = async () =>
    new Promise((resolve) => releases.push(resolve));
  const one = f.run(create(), { env, preflight: ready, transport });
  const two = f.run(create(), { env, preflight: ready, transport });
  const outcomes = Promise.allSettled([one, two]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(releases.length, 2);
  assert.equal(readRemoteWorkspaceRecord(f.storage, key)?.dispatches, 2);
  releases[0]({ kind: "unavailable", reason: "remote_econnrefused" });
  releases[1]({ kind: "pending", reason: "remote_timeout" });
  assert.ok((await outcomes).every((result) => result.status === "rejected"));
  assert.equal(readRemoteWorkspaceRecord(f.storage, key)?.phase, "pending");
  assert.ok(!f.storage.exists(".ai-workspace"));
});

test("active producer defers handoff so local settlement remains possible", async (context) => {
  const f = fixture(context);
  await f.run(create());
  const group = beginWorkspaceProducerGroup(f.storage, key, {
    artifacts: [{ path: "tmp/work", category: "temporary" }],
  });
  await assert.rejects(
    f.run(sync(), {
      env,
      preflight: ready,
      transport: async () => {
        throw Error("active producer must not send");
      },
    }),
    codeIs("remote_sync_deferred_active_work"),
  );
  f.storage.writeJson("status.json", { category: "active" });
  const revision = readDossier(f.storage, key).meta?.revision;
  assert.ok(revision);
  const result = await f.run(
    {
      action: "status",
      flags: { task: key, "expected-revision": revision, input: "status.json" },
    },
    {
      env,
      preflight: ready,
      transport: async () => {
        throw Error("must defer");
      },
    },
  );
  assert.equal(
    /** @type {{reason:string}} */ (result).reason,
    "remote_sync_deferred_active_work",
  );
  finalizeWorkspaceProducerGroup(f.storage, group, {
    quiescent: true,
    cleanupTemporary: false,
  });
  await f.run(sync(), {
    env,
    preflight: ready,
    transport: async (_config, payload) => f.success(payload),
  });
  assert.equal(readRemoteWorkspaceRecord(f.storage, key)?.phase, "remote");
});

test("invalid initial payload does not reserve key and can be corrected before sending", async (context) => {
  const f = fixture(context);
  f.storage.write("body.md", "x".repeat(20001));
  const request =
    /** @type {import('../src/cli/WorkspaceCommand.types').WorkspaceCommandRequest} */ ({
      action: "create",
      flags: { task: key, title: "Body", "body-file": "body.md", ...selectors },
    });
  await assert.rejects(
    f.run(request, {
      env,
      preflight: async () => {
        throw Error("invalid input must not send");
      },
    }),
    codeIs("remote_payload_invalid"),
  );
  assert.equal(readRemoteWorkspaceRecord(f.storage, key), null);
  f.storage.write("body.md", "Corrected body");
  await f.run(request, {
    env,
    preflight: ready,
    transport: async (_config, payload) => f.success(payload),
  });
  assert.equal(readRemoteWorkspaceRecord(f.storage, key)?.phase, "remote");
});

test("portable fallback without private outbox keeps server source identity", async (context) => {
  const original = fixture(context);
  await original.run(create());
  const clientTaskId = readRemoteWorkspaceRecord(
    original.storage,
    key,
  )?.clientTaskId;
  const copy = fixture(context);
  fs.cpSync(
    path.join(original.root, ".ai-workspace"),
    path.join(copy.root, ".ai-workspace"),
    { recursive: true },
  );
  assert.equal(readRemoteWorkspaceRecord(copy.storage, key), null);
  await copy.run(sync(), {
    env,
    preflight: ready,
    transport: async (_config, payload) => {
      assert.equal(payload.clientTaskId, clientTaskId);
      return copy.success(payload);
    },
  });
  assert.equal(
    readRemoteWorkspaceRecord(copy.storage, key)?.clientTaskId,
    clientTaskId,
  );
});

test("connection ignores legacy global selectors; new online task needs explicit project", async (context) => {
  assert.deepEqual(
    readRemoteWorkspaceConfig({
      ...env,
      REALIZE_TASK_MANAGER_PROJECT_ID: randomUUID(),
      REALIZE_TASK_MANAGER_LIST_ID: "invalid",
    }),
    {
      baseUrl: env.REALIZE_TASK_MANAGER_URL,
      token: env.REALIZE_TASK_MANAGER_TOKEN,
    },
  );
  assert.equal(
    readRemoteWorkspaceConfig({
      REALIZE_TASK_MANAGER_PROJECT_ID: randomUUID(),
    }),
    null,
  );
  for (const flags of [{}, { list: selectors.list }, { project: "invalid" }]) {
    const f = fixture(context);
    await assert.rejects(
      f.run(
        {
          action: "create",
          flags: { task: key, title: "Test task", ...flags },
        },
        {
          env,
          preflight: async () => {
            throw Error("must not request");
          },
        },
      ),
      /./,
    );
    assert.equal(readRemoteWorkspaceRecord(f.storage, key), null);
    assert.equal(f.storage.exists(".ai-workspace"), false);
  }
});

test("one connection creates tasks in independent projects and fills the sole list", async (context) => {
  const f = fixture(context);
  const choices = [
    { project: selectors.project, list: selectors.list },
    { project: randomUUID(), list: randomUUID() },
  ];
  const taskKeys = new Set();
  const taskIds = new Set();
  for (const [index, choice] of choices.entries()) {
    const taskKey = `project-${index}`;
    await f.run(
      {
        action: "create",
        flags: {
          task: taskKey,
          title: "Multi project",
          project: choice.project,
        },
      },
      {
        env,
        preflight: async (config, selected) => {
          assert.equal(selected.projectId, choice.project);
          assert.equal(selected.listId, null);
          return {
            kind: "ready",
            reason: null,
            target: {
              baseUrl: config.baseUrl,
              projectId: choice.project,
              listId: choice.list,
            },
          };
        },
        transport: async (_config, payload) => {
          const response = f.success(payload);
          assert.equal(response.kind, "success");
          taskKeys.add(response.data.task.key);
          return response;
        },
      },
    );
    const ref = readRemoteWorkspaceRecord(f.storage, taskKey)?.taskRef;
    assert.ok(ref);
    assert.equal(ref.listId, choice.list);
    assert.equal(ref.projectId, choice.project);
    taskIds.add(ref.id);
  }
  assert.equal(taskKeys.size, choices.length);
  assert.equal(taskIds.size, choices.length);
  assert.equal(f.storage.exists(".ai-workspace"), false);
});

test("unselected offline task stays editable and explicit sync selects its destination", async (context) => {
  const f = fixture(context);
  await f.run({ action: "create", flags: { task: key, title: "Offline" } });
  const before = readRemoteWorkspaceRecord(f.storage, key);
  assert.equal(before?.selection, null);
  f.storage.writeJson("status.json", { category: "active" });
  const result = await f.run(
    {
      action: "status",
      flags: { task: key, "expected-revision": 1, input: "status.json" },
    },
    {
      env,
      preflight: async () => {
        throw Error("unresolved must not send");
      },
    },
  );
  assert.equal(
    /** @type {{reason:string}} */ (result).reason,
    "remote_selection_required",
  );
  await assert.rejects(
    f.run({ action: "sync", flags: { task: key } }, { env }),
    codeIs("remote_project_required"),
  );
  await f.run(sync(), {
    env,
    preflight: ready,
    transport: async (_config, payload) => f.success(payload),
  });
  assert.equal(
    readRemoteWorkspaceRecord(f.storage, key)?.clientTaskId,
    before?.clientTaskId,
  );
});

test("first refusal retains resolved selection for the next connection", async (context) => {
  const f = fixture(context);
  await f.run(
    {
      action: "create",
      flags: { task: key, title: "Automatic list", project: selectors.project },
    },
    {
      env,
      preflight: ready,
      transport: async () => ({
        kind: "unavailable",
        reason: "remote_econnrefused",
      }),
    },
  );
  assert.deepEqual(readRemoteWorkspaceRecord(f.storage, key)?.selection, {
    baseUrl: env.REALIZE_TASK_MANAGER_URL,
    projectId: selectors.project,
    listId: selectors.list,
  });
  await f.run(
    { action: "sync", flags: { task: key } },
    {
      env,
      preflight: async (config, selection) => {
        assert.equal(selection.listId, selectors.list);
        return ready(config, selection);
      },
      transport: async (_config, payload) => f.success(payload),
    },
  );
});

test("legacy v1 queued/pending/remote records read without rewrite and retry keeps exact payload", async (context) => {
  for (const phase of ["queued", "pending", "remote"]) {
    const f = fixture(context);
    if (phase === "queued") await f.run(create());
    else {
      const result = f.run(create(), {
        env,
        preflight: ready,
        transport: async (_config, payload) =>
          phase === "remote"
            ? f.success(payload)
            : { kind: "pending", reason: "remote_timeout" },
      });
      if (phase === "pending")
        await assert.rejects(result, codeIs("remote_sync_pending"));
      else await result;
    }
    const original = readRemoteWorkspaceRecord(f.storage, key);
    assert.ok(original);
    const { selection: unused, ...legacy } = original;
    void unused;
    f.storage.writeJson(remoteWorkspaceRecordPath(key), {
      ...legacy,
      schemaVersion: 1,
    });
    const bytes = f.storage.read(remoteWorkspaceRecordPath(key));
    await f.run({ action: "inspect", flags: { task: key } });
    assert.deepEqual(f.storage.read(remoteWorkspaceRecordPath(key)), bytes);
    let calls = 0;
    await f.run(
      phase === "queued" ? sync() : { action: "sync", flags: { task: key } },
      {
        env,
        preflight: async (config, selection) => {
          assert.equal(phase, "queued");
          return ready(config, selection);
        },
        transport: async (_config, payload) => {
          calls++;
          if (phase === "pending") assert.deepEqual(payload, original.payload);
          return f.success(payload);
        },
      },
    );
    assert.equal(calls, phase === "remote" ? 0 : 1);
    assert.equal(
      readRemoteWorkspaceRecord(f.storage, key)?.createHash,
      original.createHash,
    );
  }
});

test("different concurrent selectors and replay URL cannot redirect a task", async (context) => {
  const f = fixture(context);
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  const first = f.run(create(), {
    env,
    preflight: async (config, selection) => {
      await gate;
      return ready(config, selection);
    },
    transport: async (_config, payload) => f.success(payload),
  });
  await assert.rejects(
    f.run(
      {
        action: "create",
        flags: {
          task: key,
          title: "Test task",
          project: randomUUID(),
          list: randomUUID(),
        },
      },
      { env },
    ),
    codeIs("remote_target_conflict"),
  );
  release();
  await first;
  await assert.rejects(
    f.run(
      { action: "sync", flags: { task: key } },
      {
        env: {
          ...env,
          REALIZE_TASK_MANAGER_URL: "https://other.invalid/api/task-manager",
        },
      },
    ),
    codeIs("remote_target_conflict"),
  );
  await assert.rejects(
    f.run(
      { action: "sync", flags: { task: key, list: randomUUID() } },
      { env },
    ),
    codeIs("remote_target_conflict"),
  );
  assert.equal(
    readRemoteWorkspaceRecord(f.storage, key)?.taskRef?.projectId,
    selectors.project,
  );
});

test("ambiguous list blocks online creation but lets an existing local task continue", async (context) => {
  const f = fixture(context);
  const request = /** @type {const} */ ({
    action: "create",
    flags: { task: key, title: "Offline project", project: selectors.project },
  });
  await f.run(request);
  f.storage.writeJson("status.json", { category: "active" });
  const result = await f.run(
    {
      action: "status",
      flags: { task: key, "expected-revision": 1, input: "status.json" },
    },
    {
      env,
      preflight: async () => ({
        kind: "rejected",
        reason: "remote_list_required",
      }),
    },
  );
  assert.equal(
    /** @type {{reason:string}} */ (result).reason,
    "remote_list_required",
  );
  assert.equal(readDossier(f.storage, key).meta?.status.category, "active");
  const fresh = fixture(context);
  await assert.rejects(
    fresh.run(request, {
      env,
      preflight: async () => ({
        kind: "rejected",
        reason: "remote_list_required",
      }),
    }),
    codeIs("remote_list_required"),
  );
  assert.equal(fresh.storage.exists(".ai-workspace"), false);
});
