/**
 * @file .ai/tools/task-workspace/test/taskManagerCommands.test.mjs
 * @version 1.1.0
 * @date 2026-10-19
 * @description Проверяет management CLI, неизменный request-id, строгие DTO и отсутствие локального fallback.
 * @see documentation/specifications/task-management-execution.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createTaskCursor } from "../../../../packages/payload-task-manager/src/server/taskCursor.adapter.ts";
import { WorkspaceFs } from "../src/filesystem/WorkspaceFs.adapter.mjs";
import { fixture as authFixture } from "./authTest.fixture.mjs";
import { WorkspaceError } from "../src/Workspace.error.mjs";
import { runtimeRoot } from "../src/workspacePaths.config.mjs";
import { parseWorkspaceArguments } from "../src/cli/parseWorkspaceArguments.validator.mjs";
import { presentCompactWorkspaceResponse } from "../src/cli/presentCompactWorkspaceResponse.util.mjs";
import {
  isTaskManagerCommand,
  runTaskManagerCommand,
} from "../src/remote/runTaskManagerCommand.controller.mjs";

const projectId = "11111111-1111-4111-8111-111111111111";
const listId = "22222222-2222-4222-8222-222222222222";
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const cursor = createTaskCursor("synthetic-test-only", "owner:projects", 12);
const env = {
  REALIZE_TASK_MANAGER_URL: "http://127.0.0.1:3000/api/task-manager",
  REALIZE_TASK_MANAGER_TOKEN: "private-test-token",
};
const project = {
  id: projectId,
  title: "Project",
  description: "Description",
  ownerId: "owner",
  memberIds: ["owner"],
  revision: 1,
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
};
const list = {
  id: listId,
  projectId,
  title: "List",
  revision: 1,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
};
const projectCreate = {
  title: "Project",
  description: "Description",
  memberIds: [],
};
const projectUpdate = { ...projectCreate, expectedRevision: 1 };
const listCreate = { projectId, title: "List" };
const listUpdate = { title: "List", expectedRevision: 1 };

/** @param {string[]} args */
function command(args) {
  const request = parseWorkspaceArguments(args);
  assert.ok(isTaskManagerCommand(request));
  return request;
}
/** @param {unknown} data */
const response = (data) => ({
  kind: /** @type {const} */ ("response"),
  status: 200,
  value: { ok: true, data },
});
/** @param {string} code */
const codeIs = (code) => (/** @type {unknown} */ error) =>
  error instanceof WorkspaceError && error.code === code;
/** @param {import('node:test').TestContext} context */
function fixture(context) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "realize-management-cli-"),
  );
  const storage = new WorkspaceFs(root);
  context.after(() => {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  /** @param {string[]} args @param {Parameters<typeof runTaskManagerCommand>[2]} [options] */
  const run = (args, options = { env }) =>
    runTaskManagerCommand(storage, command(args), {
      ...options,
      auth: authFixture().deps,
    });
  const noWorkspace = () => {
    assert.ok(!storage.exists(".ai-workspace"));
    assert.ok(!storage.exists(runtimeRoot));
  };
  return { root, storage, run, noWorkspace };
}

test("parser accepts management without task and optional create/sync selectors only", () => {
  const commands = [
    ["projects"],
    ["projects", "--after", cursor],
    ["project", "--project", projectId],
    ["project-create", "--input", "-", "--request-id", requestId],
    [
      "project-update",
      "--project",
      projectId,
      "--input",
      "input.json",
      "--request-id",
      requestId,
    ],
    ["lists", "--project", projectId, "--after", cursor],
    ["list", "--list", listId],
    ["list-create", "--input", "input.json", "--request-id", requestId],
    [
      "list-update",
      "--list",
      listId,
      "--input",
      "-",
      "--request-id",
      requestId,
    ],
  ];
  for (const args of commands)
    assert.ok(isTaskManagerCommand(parseWorkspaceArguments(args)));
  for (const action of ["create", "sync"]) {
    const args = [
      action,
      "--task",
      "fixture",
      "--project",
      projectId,
      "--list",
      listId,
    ];
    if (action === "create") args.push("--title", "Title");
    const request = parseWorkspaceArguments(args);
    assert.ok(request.action === "create" || request.action === "sync");
    assert.equal(request.flags.project, projectId);
  }
  const normalized = command([
    "project-create",
    "--input",
    "-",
    "--request-id",
    requestId.toUpperCase(),
  ]);
  assert.ok("request-id" in normalized.flags);
  assert.equal(normalized.flags["request-id"], requestId);
});

test("parser rejects missing request-id, invalid UUIDs, task flags and top-level revision", () => {
  for (const args of [
    ["project-create", "--input", "-"],
    ["project-create", "--request-id", requestId],
    ["project-create", "--input", "-", "--request-id", "not-uuid"],
    ["project"],
    ["lists"],
    ["list"],
    ["project", "--project", "Title"],
    ["projects", "--after", "x".repeat(257)],
    ["projects", "--task", "a"],
    [
      "list-update",
      "--list",
      listId,
      "--input",
      "-",
      "--request-id",
      requestId,
      "--expected-revision",
      "1",
    ],
    ["sync", "--task", "a", "--project", "bad"],
    [
      "status",
      "--task",
      "a",
      "--expected-revision",
      "1",
      "--input",
      "-",
      "--project",
      projectId,
    ],
    ["projects", "--after", projectId, "--after", listId],
  ])
    assert.throws(() => parseWorkspaceArguments(args));
});

test("pagination preserves opaque server cursor and encodes query values", async (context) => {
  const f = fixture(context);
  const request = command(["projects", "--after", cursor]);
  assert.equal("after" in request.flags ? request.flags.after : null, cursor);
  for (const value of [cursor, `${cursor}&projectId=other`]) {
    await f.run(["projects", "--after", value], {
      env,
      transport: async (_config, input) => {
        assert.equal(
          input.path,
          `/projects?after=${encodeURIComponent(value)}`,
        );
        return response({ items: [], nextCursor: cursor });
      },
    });
  }
  f.noWorkspace();
});

test("all eight management actions use exact API routes, schemas and caller request-id", async (context) => {
  const f = fixture(context);
  const cases = [
    {
      args: ["projects", "--after", cursor],
      method: "GET",
      route: `/projects?after=${cursor}`,
      data: { items: [project], nextCursor: cursor },
    },
    {
      args: ["project", "--project", projectId],
      method: "GET",
      route: `/projects/${projectId}`,
      data: project,
    },
    {
      args: ["project-create"],
      method: "POST",
      route: "/projects",
      data: project,
      body: projectCreate,
    },
    {
      args: ["project-update", "--project", projectId],
      method: "PATCH",
      route: `/projects/${projectId}`,
      data: project,
      body: projectUpdate,
    },
    {
      args: ["lists", "--project", projectId, "--after", cursor],
      method: "GET",
      route: `/lists?projectId=${projectId}&after=${cursor}`,
      data: { items: [list], nextCursor: null },
    },
    {
      args: ["list", "--list", listId],
      method: "GET",
      route: `/lists/${listId}`,
      data: list,
    },
    {
      args: ["list-create"],
      method: "POST",
      route: "/lists",
      data: list,
      body: listCreate,
    },
    {
      args: ["list-update", "--list", listId],
      method: "PATCH",
      route: `/lists/${listId}`,
      data: list,
      body: listUpdate,
    },
  ];
  for (const item of cases) {
    const args = [...item.args];
    if (item.body) {
      f.storage.writeJson("input.json", item.body);
      args.push("--input", "input.json", "--request-id", requestId);
    }
    const output = await f.run(args, {
      env,
      transport: async (config, input) => {
        assert.deepEqual(config, {
          baseUrl: env.REALIZE_TASK_MANAGER_URL,
          token: env.REALIZE_TASK_MANAGER_TOKEN,
        });
        assert.equal(input.method, item.method);
        assert.equal(input.path, item.route);
        assert.deepEqual(input.payload, item.body);
        assert.equal(input.requestId, item.body ? requestId : undefined);
        return response(item.data);
      },
    });
    assert.deepEqual(output, { data: item.data });
  }
  f.noWorkspace();
});

test("invalid full input and protected paths reject before transport without files", async (context) => {
  const f = fixture(context);
  const cases = [
    {
      action: "project-create",
      body: { ...projectCreate, ownerId: "other" },
      selector: [],
    },
    {
      action: "project-update",
      body: projectCreate,
      selector: ["--project", projectId],
    },
    {
      action: "project-update",
      body: { ...projectUpdate, expectedRevision: 0 },
      selector: ["--project", projectId],
    },
    {
      action: "list-create",
      body: { ...listCreate, projectId: "bad" },
      selector: [],
    },
    {
      action: "list-update",
      body: { ...listUpdate, projectId },
      selector: ["--list", listId],
    },
  ];
  for (const item of cases) {
    f.storage.writeJson("input.json", item.body);
    await assert.rejects(
      f.run(
        [
          item.action,
          ...item.selector,
          "--input",
          "input.json",
          "--request-id",
          requestId,
        ],
        {
          env,
          transport: async () => {
            throw Error("HTTP forbidden");
          },
        },
      ),
      codeIs("remote_payload_invalid"),
    );
  }
  await assert.rejects(
    f.run(["project-create", "--input", ".env", "--request-id", requestId]),
    codeIs("protected_input"),
  );
  f.noWorkspace();
});

test("absent or partial connection never creates management fallback", async (context) => {
  const f = fixture(context);
  await assert.rejects(
    f.run(["projects"], { env: {} }),
    codeIs("remote_not_configured"),
  );
  await assert.rejects(
    f.run(["projects"], {
      env: { REALIZE_TASK_MANAGER_URL: env.REALIZE_TASK_MANAGER_URL },
    }),
    codeIs("remote_config_incomplete"),
  );
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test("read errors and strict foreign DTOs reject without exposing server body", async (context) => {
  const f = fixture(context);
  for (const status of [301, 401, 403, 404, 409, 422, 429, 503])
    await assert.rejects(
      f.run(["projects"], {
        env,
        transport: async () => ({
          kind: "response",
          status,
          value: { secret: "server-private" },
        }),
      }),
      codeIs(`remote_http_${status}`),
    );
  for (const item of [
    {
      args: ["projects"],
      data: {
        items: [{ ...project, secret: "server-private" }],
        nextCursor: null,
      },
    },
    {
      args: ["projects"],
      data: { items: [project], nextCursor: "x".repeat(257) },
    },
    {
      args: ["project", "--project", projectId],
      data: { ...project, id: listId },
    },
    { args: ["list", "--list", listId], data: { ...list, id: projectId } },
    {
      args: ["lists", "--project", projectId],
      data: { items: [{ ...list, projectId: listId }], nextCursor: null },
    },
  ])
    await assert.rejects(
      f.run(item.args, { env, transport: async () => response(item.data) }),
      (error) => {
        assert.ok(codeIs("remote_contract_invalid")(error));
        assert.ok(!String(error).includes("server-private"));
        return true;
      },
    );
  f.noWorkspace();
});

test("unknown mutation result replays identical explicit key and JSON without hidden journal", async (context) => {
  const f = fixture(context);
  f.storage.writeJson("input.json", projectCreate);
  const args = [
    "project-create",
    "--input",
    "input.json",
    "--request-id",
    requestId,
  ];
  /** @type {Parameters<import('../src/remote/requestTaskManagerJson.adapter.mjs').requestTaskManagerJson>[1][]} */
  const sent = [];
  await assert.rejects(
    f.run(args, {
      env,
      transport: async (_config, input) => {
        sent.push(input);
        return { kind: "pending", reason: "remote_timeout" };
      },
    }),
    codeIs("remote_request_pending"),
  );
  await f.run(args, {
    env,
    transport: async (_config, input) => {
      sent.push(input);
      return response(project);
    },
  });
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(sent[1].requestId, requestId);
  assert.deepEqual(fs.readdirSync(f.root), ["input.json"]);
  f.noWorkspace();
});

test("mutation refusals never fallback; ambiguous responses instruct exact replay", async (context) => {
  const f = fixture(context);
  f.storage.writeJson("input.json", listCreate);
  const args = [
    "list-create",
    "--input",
    "input.json",
    "--request-id",
    requestId,
  ];
  for (const status of [401, 403, 404, 409, 422, 429])
    await assert.rejects(
      f.run(args, {
        env,
        transport: async () => ({ kind: "response", status, value: null }),
      }),
      codeIs(`remote_http_${status}`),
    );
  for (const status of [500, 502, 503, 504])
    await assert.rejects(
      f.run(args, {
        env,
        transport: async () => ({ kind: "response", status, value: null }),
      }),
      codeIs("remote_request_pending"),
    );
  await assert.rejects(
    f.run(args, {
      env,
      transport: async () => ({
        kind: "unavailable",
        reason: "remote_econnrefused",
      }),
    }),
    codeIs("remote_econnrefused"),
  );
  await assert.rejects(
    f.run(args, {
      env,
      transport: async () => ({
        kind: "pending",
        reason: "remote_tls_invalid",
      }),
    }),
    codeIs("remote_tls_invalid"),
  );
  await assert.rejects(
    f.run(args, {
      env,
      transport: async () => response({ ...list, projectId: listId }),
    }),
    codeIs("remote_request_pending"),
  );
  f.noWorkspace();
});

test("compact keeps management DTO/page and leaves local response keys unchanged", () => {
  const request = command(["projects", "--compact"]);
  const value = { data: { items: [project], nextCursor: cursor } };
  assert.deepEqual(
    presentCompactWorkspaceResponse(request, value).data,
    value.data,
  );
  assert.equal(
    presentCompactWorkspaceResponse(request, null, { error: "remote_http_401" })
      .data,
    null,
  );
  assert.ok(
    !(
      "data" in
      presentCompactWorkspaceResponse(
        { action: "inspect", flags: { task: "a" } },
        { data: { private: "not-management" } },
      )
    ),
  );
});

test("real CLI accepts stdin JSON, sends PATCH and preserves compact data without local writes", async (context) => {
  const f = fixture(context);
  const server = http.createServer((request, response) => {
    assert.equal(request.method, "PATCH");
    assert.equal(request.url, `/api/task-manager/lists/${listId}`);
    assert.equal(
      request.headers.authorization,
      `Bearer ${env.REALIZE_TASK_MANAGER_TOKEN}`,
    );
    assert.equal(request.headers["idempotency-key"], requestId);
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      assert.deepEqual(JSON.parse(body), listUpdate);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, data: list }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(
    () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve(undefined)));
      }),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const copiedSource = path.join(f.root, ".ai/tools/task-workspace/src");
  fs.mkdirSync(path.dirname(copiedSource), { recursive: true });
  fs.cpSync(fileURLToPath(new URL("../src/", import.meta.url)), copiedSource, {
    recursive: true,
  });
  fs.symlinkSync(
    fileURLToPath(new URL("../../../../node_modules/", import.meta.url)),
    path.join(f.root, "node_modules"),
    "dir",
  );
  const child = spawn(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx/esm"),
      path.join(copiedSource, "cli/runWorkspaceCommand.controller.mjs"),
      "list-update",
      "--list",
      listId,
      "--input",
      "-",
      "--request-id",
      requestId,
      "--compact",
    ],
    {
      cwd: f.root,
      env: {
        ...process.env,
        ...env,
        REALIZE_TASK_MANAGER_URL: `http://127.0.0.1:${address.port}/api/task-manager`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  context.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.stdin.end(JSON.stringify(listUpdate));
  const timer = setTimeout(() => child.kill("SIGKILL"), 20000);
  try {
    const [code] = await once(child, "close");
    assert.equal(code, 0, stderr);
  } finally {
    clearTimeout(timer);
  }
  assert.deepEqual(JSON.parse(stdout).data, list);
  assert.ok(!stdout.includes(env.REALIZE_TASK_MANAGER_TOKEN));
  f.noWorkspace();
});
