/**
 * @file .ai/tools/git-delivery/test/GitWorkerCapability.service.test.ts
 * @version 1.1.1
 * @date 2026-09-09
 * @description Проверяет границы Git inspect и commit capability без запуска Git и модели.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyResult, PolicyError } from "../src/contracts.ts";
import type { Context, Result } from "../src/contracts.ts";
import { GitWorkerCapabilityService } from "../src/worker/GitWorkerCapability.service.ts";
import type {
  GitWorkerCommand,
  GitWorkerContext,
} from "../src/worker/GitWorker.types.ts";

function context(): Context {
  return {
    version: 1,
    requestId: "inspect-request",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: "/fixture/repository",
    authorization: {
      actions: ["inspect"],
      scope: { mode: "paths", paths: ["owned.txt"] },
    },
  };
}

function result(): Result {
  return {
    ...emptyResult(),
    requestId: "inspect-request",
    action: "inspect",
    status: "succeeded",
    branch: "main",
    commit: "a".repeat(40),
    fingerprint: "b".repeat(64),
    changes: { items: [{ path: "owned.txt", status: " M" }], truncated: false },
    summary: "Состояние fixture прочитано.",
  };
}

function request(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    threadId: "inspect-thread",
    turnId: "inspect-turn",
    callId: "inspect-call",
    tool: "git_inspect",
    arguments: {},
    ...overrides,
  };
}

function bind(capability: GitWorkerCapabilityService): void {
  capability.threadId = "inspect-thread";
  capability.turnId = "inspect-turn";
}

function denied(error: unknown): boolean {
  assert.ok(error instanceof PolicyError);
  assert.equal(error.code, "worker_capability_denied");
  return true;
}

test("без запроса инструмента capability не запускает handler и возвращает null", async () => {
  let calls = 0;
  const capability = new GitWorkerCapabilityService(
    { action: "inspect" },
    context(),
    async () => {
      calls += 1;
      return result();
    },
  );
  bind(capability);

  assert.equal(await capability.getResult(), null);
  assert.equal(calls, 0);
  assert.equal(capability.calls, 0);
  assert.equal(capability.violation, false);
});

test("разрешённый вызов сохраняет контекст launcher и фактический Result", async () => {
  const assignedContext = context();
  const expected = result();
  let received: GitWorkerContext | undefined;
  const capability = new GitWorkerCapabilityService(
    { action: "inspect" },
    assignedContext,
    async (_command, input) => {
      received = input;
      return expected;
    },
  );
  bind(capability);

  const response = await capability.handle(
    "item/tool/call",
    request({ namespace: null }),
  );

  assert.deepEqual(received, assignedContext);
  assert.deepEqual(response, {
    contentItems: [{ type: "inputText", text: JSON.stringify(expected) }],
    success: true,
  });
  assert.strictEqual(await capability.getResult(), expected);
  assert.equal(capability.calls, 1);
  assert.equal(capability.violation, false);
});

test("constructor принимает all и точную область путей только для inspect", async (t) => {
  const scopes: Context["authorization"]["scope"][] = [
    { mode: "all" },
    { mode: "paths", paths: ["owned.txt", "папка/имя с пробелом.ts"] },
  ];
  for (const scope of scopes) {
    await t.test(scope.mode, async () => {
      const assignedContext = context();
      assignedContext.authorization.scope = scope;
      let received: GitWorkerContext | undefined;
      const capability = new GitWorkerCapabilityService(
        { action: "inspect" },
        assignedContext,
        async (_command, input) => {
          received = input;
          return result();
        },
      );
      bind(capability);

      await capability.handle("item/tool/call", request());

      assert.deepEqual(received, assignedContext);
      assert.deepEqual(received?.authorization.actions, ["inspect"]);
    });
  }
});

test("constructor отклоняет расширение полномочий и неверную область", async (t) => {
  const source = context();
  const withScope = (scope: unknown) => ({
    ...source,
    authorization: { actions: ["inspect"], scope },
  });
  const cases: { name: string; input: unknown; code: string }[] = [
    { name: "нет контекста", input: null, code: "invalid_input" },
    {
      name: "неверная версия",
      input: { ...source, version: 2 },
      code: "invalid_context",
    },
    {
      name: "относительный корень",
      input: { ...source, repositoryRoot: "repository" },
      code: "invalid_context",
    },
    {
      name: "неверный requestId",
      input: { ...source, requestId: "../request" },
      code: "invalid_identifier",
    },
    {
      name: "неизвестное поле контекста",
      input: { ...source, permission: "write" },
      code: "invalid_input",
    },
    ...[[], ["commit"], ["inspect", "commit"], ["inspect", "push"]].map(
      (actions) => ({
        name: `actions ${JSON.stringify(actions)}`,
        input: {
          ...source,
          authorization: { ...source.authorization, actions },
        },
        code: "worker_scope_invalid",
      }),
    ),
    {
      name: "авторство commit",
      input: {
        ...source,
        identity: { name: "Fixture Author", email: "fixture@example.invalid" },
      },
      code: "worker_scope_invalid",
    },
    {
      name: "проверки commit",
      input: {
        ...source,
        verification: {
          inputPaths: [],
          requiredChecks: ["commit-review"],
          results: [],
        },
      },
      code: "worker_scope_invalid",
    },
    {
      name: "пустая область",
      input: withScope({ mode: "paths", paths: [] }),
      code: "invalid_scope",
    },
    {
      name: "all со списком",
      input: withScope({ mode: "all", paths: ["owned.txt"] }),
      code: "invalid_scope",
    },
    {
      name: "неизвестный scope mode",
      input: withScope({ mode: "directory" }),
      code: "invalid_scope",
    },
    {
      name: "неизвестное поле scope",
      input: withScope({ mode: "all", write: true }),
      code: "invalid_input",
    },
    {
      name: "повтор пути",
      input: withScope({ mode: "paths", paths: ["owned.txt", "owned.txt"] }),
      code: "invalid_input",
    },
    ...[
      "../foreign.txt",
      "/foreign.txt",
      ".git/config",
      "dir/../foreign.txt",
      "dir\\foreign.txt",
      "dir//file",
      "dir/",
    ].map((path) => ({
      name: `недопустимый путь ${path}`,
      input: withScope({ mode: "paths", paths: [path] }),
      code: "invalid_path",
    })),
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      let calls = 0;
      assert.throws(
        () =>
          new GitWorkerCapabilityService(
            { action: "inspect" },
            entry.input as Context,
            async () => {
              calls += 1;
              return result();
            },
          ),
        (error: unknown) => {
          assert.ok(error instanceof PolicyError);
          assert.equal(error.code, entry.code);
          return true;
        },
      );
      assert.equal(calls, 0);
    });
  }
});

test("изменение исходного контекста не расширяет назначенные полномочия", async () => {
  const assignedContext = context();
  const expectedContext = structuredClone(assignedContext);
  let received: GitWorkerContext | undefined;
  const capability = new GitWorkerCapabilityService(
    { action: "inspect" },
    assignedContext,
    async (_command, input) => {
      received = input;
      return result();
    },
  );
  bind(capability);

  assignedContext.repositoryRoot = "/foreign";
  assignedContext.authorization.scope = { mode: "all" };
  await capability.handle("item/tool/call", request());

  assert.deepEqual(received, expectedContext);
});

test("capability отклоняет чужие возможности и неверные аргументы до handler", async (t) => {
  const cases: { name: string; method?: string; input: unknown }[] = [
    {
      name: "запрос shell",
      method: "item/commandExecution/requestApproval",
      input: request(),
    },
    { name: "другой инструмент", input: request({ tool: "git_commit" }) },
    { name: "namespace", input: request({ namespace: "git" }) },
    { name: "пустой namespace", input: request({ namespace: "" }) },
    { name: "чужой thread", input: request({ threadId: "foreign-thread" }) },
    { name: "чужой turn", input: request({ turnId: "foreign-turn" }) },
    { name: "нет thread", input: request({ threadId: undefined }) },
    { name: "нет turn", input: request({ turnId: undefined }) },
    { name: "нет callId", input: request({ callId: undefined }) },
    { name: "пустой callId", input: request({ callId: "" }) },
    { name: "числовой callId", input: request({ callId: 1 }) },
    { name: "нет arguments", input: request({ arguments: undefined }) },
    { name: "null arguments", input: request({ arguments: null }) },
    { name: "массив arguments", input: request({ arguments: [] }) },
    { name: "строка arguments", input: request({ arguments: "{}" }) },
    { name: "число arguments", input: request({ arguments: 0 }) },
    {
      name: "action commit",
      input: request({ arguments: { action: "commit" } }),
    },
    {
      name: "подмена root",
      input: request({ arguments: { repositoryRoot: "/foreign" } }),
    },
    {
      name: "расширение scope",
      input: request({ arguments: { scope: { mode: "all" } } }),
    },
    {
      name: "расширение actions",
      input: request({ arguments: { actions: ["push"] } }),
    },
    { name: "null request", input: null },
    { name: "массив request", input: [] },
    { name: "строка request", input: "item/tool/call" },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      let calls = 0;
      const capability = new GitWorkerCapabilityService(
        { action: "inspect" },
        context(),
        async () => {
          calls += 1;
          return result();
        },
      );
      bind(capability);

      await assert.rejects(
        capability.handle(entry.method ?? "item/tool/call", entry.input),
        denied,
      );
      assert.equal(calls, 0);
      assert.equal(capability.calls, 0);
      assert.equal(capability.violation, true);
      assert.equal(await capability.getResult(), null);
    });
  }
});

test("capability не принимает вызов до назначения thread и turn", async (t) => {
  for (const assigned of ["none", "thread", "turn"] as const) {
    await t.test(assigned, async () => {
      const capability = new GitWorkerCapabilityService(
        { action: "inspect" },
        context(),
        async () => {
          assert.fail("Handler не должен вызываться без назначенной сессии.");
        },
      );
      if (assigned === "thread") capability.threadId = "inspect-thread";
      if (assigned === "turn") capability.turnId = "inspect-turn";

      await assert.rejects(
        capability.handle("item/tool/call", request()),
        denied,
      );
      assert.equal(capability.calls, 0);
      assert.equal(await capability.getResult(), null);
    });
  }
});

test("конкурентный и последующий повтор используют один снимок handler", async () => {
  const pending = Promise.withResolvers<Result>();
  const expected = result();
  let calls = 0;
  const capability = new GitWorkerCapabilityService(
    { action: "inspect" },
    context(),
    async () => {
      calls += 1;
      return pending.promise;
    },
  );
  bind(capability);

  const first = capability.handle("item/tool/call", request());
  const second = capability.handle(
    "item/tool/call",
    request({ callId: "second-call" }),
  );
  const saved = capability.getResult();
  assert.equal(calls, 1);
  assert.equal(capability.calls, 1);

  pending.resolve(expected);
  const [firstResponse, secondResponse, savedResult] = await Promise.all([
    first,
    second,
    saved,
  ]);
  assert.deepEqual(firstResponse, secondResponse);
  assert.strictEqual(savedResult, expected);
  assert.deepEqual(
    await capability.handle(
      "item/tool/call",
      request({ callId: "third-call" }),
    ),
    firstResponse,
  );
  assert.equal(calls, 1);
  assert.equal(capability.calls, 1);
});

test("blocked Result handler возвращается без подмены успешным ответом", async () => {
  const expected: Result = {
    ...result(),
    status: "blocked",
    errorCode: "repository_path_invalid",
    summary: "Область чтения недопустима.",
  };
  const capability = new GitWorkerCapabilityService(
    { action: "inspect" },
    context(),
    async () => expected,
  );
  bind(capability);

  assert.deepEqual(await capability.handle("item/tool/call", request()), {
    contentItems: [{ type: "inputText", text: JSON.stringify(expected) }],
    success: false,
  });
  assert.strictEqual(await capability.getResult(), expected);
});

test("ошибка handler остаётся видимой и не запускает повторную попытку", async () => {
  const failure = new Error("Ошибка fixture handler.");
  let calls = 0;
  const capability = new GitWorkerCapabilityService(
    { action: "inspect" },
    context(),
    async () => {
      calls += 1;
      throw failure;
    },
  );
  bind(capability);
  const sameFailure = (error: unknown) => error === failure;

  await assert.rejects(
    capability.handle("item/tool/call", request()),
    sameFailure,
  );
  await assert.rejects(capability.getResult(), sameFailure);
  await assert.rejects(
    capability.handle("item/tool/call", request({ callId: "retry-call" })),
    sameFailure,
  );
  assert.equal(calls, 1);
  assert.equal(capability.calls, 1);
});

test("чужой запрос после inspect не изменяет результат и фиксирует нарушение", async () => {
  const expected = result();
  const capability = new GitWorkerCapabilityService(
    { action: "inspect" },
    context(),
    async () => expected,
  );
  bind(capability);
  await capability.handle("item/tool/call", request());

  await assert.rejects(
    capability.handle(
      "item/tool/call",
      request({ arguments: { action: "push" } }),
    ),
    denied,
  );
  assert.equal(capability.calls, 1);
  assert.equal(capability.violation, true);
  assert.strictEqual(await capability.getResult(), expected);
});

function commitContext(): Context {
  return {
    ...context(),
    authorization: {
      actions: ["commit"],
      scope: { mode: "paths", paths: ["owned.txt"] },
    },
    identity: { name: "Fixture Author", email: "fixture@example.invalid" },
    verification: {
      inputPaths: ["package.json", "checks-config.json"],
      requiredChecks: ["lint", "unit"],
      results: [
        { id: "lint", status: "passed", fingerprint: "b".repeat(64) },
        { id: "unit", status: "passed", fingerprint: "b".repeat(64) },
      ],
    },
  };
}

function commitResult(status: Result["status"] = "succeeded"): Result {
  return {
    ...result(),
    action: "commit",
    status,
    commitCreated: true,
    summary: "Commit fixture подтверждён.",
  };
}

function commitRequest(message?: string): Record<string, unknown> {
  return request({
    tool: "git_commit",
    arguments: message === undefined ? {} : { message },
  });
}

test("constructor commit требует только commit, авторство и успешные проверки одного снимка", async (t) => {
  const cases: {
    name: string;
    change: (input: Context) => void;
    code: string;
  }[] = [
    {
      name: "действие inspect",
      change: (input) => {
        input.authorization.actions = ["inspect"];
      },
      code: "worker_scope_invalid",
    },
    {
      name: "дополнительный push",
      change: (input) => {
        input.authorization.actions.push("push");
      },
      code: "worker_scope_invalid",
    },
    {
      name: "нет авторства",
      change: (input) => {
        delete input.identity;
      },
      code: "identity_required",
    },
    {
      name: "нет проверок",
      change: (input) => {
        delete input.verification;
      },
      code: "checks_required",
    },
    {
      name: "пустые requiredChecks",
      change: (input) => {
        input.verification!.requiredChecks = [];
      },
      code: "checks_required",
    },
    {
      name: "нет результата",
      change: (input) => {
        input.verification!.results.pop();
      },
      code: "checks_stale_or_missing",
    },
    {
      name: "ошибка проверки",
      change: (input) => {
        input.verification!.results[0]!.status = "failed";
      },
      code: "checks_stale_or_missing",
    },
    {
      name: "разные снимки",
      change: (input) => {
        input.verification!.results[1]!.fingerprint = "c".repeat(64);
      },
      code: "checks_stale_or_missing",
    },
  ];
  for (const entry of cases) {
    await t.test(entry.name, () => {
      const assigned = commitContext();
      entry.change(assigned);
      assert.throws(
        () =>
          new GitWorkerCapabilityService(
            { action: "commit" },
            assigned,
            async () => assert.fail("Handler до валидации запрещён."),
          ),
        { code: entry.code },
      );
    });
  }
});

test("inspect принимает точные inputPaths без авторства и результатов проверок", async () => {
  const assigned = context();
  assigned.verification = {
    inputPaths: ["checks-config.json"],
    requiredChecks: [],
    results: [],
  };
  const expected = structuredClone(assigned);
  let received: GitWorkerContext | undefined;
  const capability = new GitWorkerCapabilityService(
    { action: "inspect" },
    assigned,
    async (_command, input) => {
      received = input;
      return result();
    },
  );
  bind(capability);
  assigned.verification.inputPaths.push("foreign.txt");

  await capability.handle("item/tool/call", request());

  assert.deepEqual(received, expected);
});

test("набор инструментов соответствует действию и наличию заданного сообщения", () => {
  const deliver = async () => result();
  const inspect = new GitWorkerCapabilityService(
    { action: "inspect" },
    context(),
    deliver,
  );
  const fixed = new GitWorkerCapabilityService(
    { action: "commit", message: "docs: fixture" },
    commitContext(),
    deliver,
  );
  const generated = new GitWorkerCapabilityService(
    { action: "commit" },
    commitContext(),
    deliver,
  );

  assert.deepEqual(
    inspect.tools.map((tool) => tool.name),
    ["git_inspect"],
  );
  assert.deepEqual(
    fixed.tools.map((tool) => tool.name),
    ["git_commit"],
  );
  assert.deepEqual(fixed.tools[0]!.inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  assert.deepEqual(
    generated.tools.map((tool) => tool.name),
    ["git_inspect", "git_commit"],
  );
  assert.deepEqual(generated.tools[1]!.inputSchema, {
    type: "object",
    properties: { message: { type: "string", minLength: 1, maxLength: 4096 } },
    required: ["message"],
    additionalProperties: false,
  });
});

test("commit сохраняет заданное сообщение и независимый контекст caller", async () => {
  const message = "  docs: fixture\n\nОписание с пробелами.\n";
  const assignedCommand: GitWorkerCommand = { action: "commit", message };
  const assignedContext = commitContext();
  const expectedContext = structuredClone(assignedContext);
  const expectedResult = commitResult();
  let receivedCommand: GitWorkerCommand | undefined;
  let receivedContext: GitWorkerContext | undefined;
  const capability = new GitWorkerCapabilityService(
    assignedCommand,
    assignedContext,
    async (command, input) => {
      receivedCommand = command;
      receivedContext = input;
      return expectedResult;
    },
  );
  bind(capability);
  assignedCommand.message = "Подменённое сообщение.";
  assignedContext.identity!.name = "Other Author";
  assignedContext.verification!.results = [];
  capability.command.message = "Изменение внешней копии.";

  await capability.handle("item/tool/call", commitRequest());

  assert.deepEqual(receivedCommand, { action: "commit", message });
  assert.deepEqual(receivedContext, expectedContext);
  assert.deepEqual(capability.command, { action: "commit", message });
  assert.strictEqual(await capability.getResult(), expectedResult);
  assert.equal(capability.calls, 1);
});

test("commit с заданным сообщением не принимает preview или аргументы модели", async (t) => {
  for (const input of [
    request(),
    commitRequest("другое сообщение"),
    request({
      tool: "git_commit",
      arguments: { action: "commit", repositoryRoot: "/foreign" },
    }),
  ]) {
    await t.test(JSON.stringify(input), async () => {
      const capability = new GitWorkerCapabilityService(
        { action: "commit", message: "docs: fixture" },
        commitContext(),
        async () => assert.fail("Запрещённый запрос не вызывает handler."),
      );
      bind(capability);
      await assert.rejects(capability.handle("item/tool/call", input), denied);
      assert.equal(capability.calls, 0);
      assert.equal(await capability.getResult(), null);
    });
  }
});

test("сгенерированное сообщение использует обязательный preview той же области и один commit", async () => {
  const assigned = commitContext();
  const preview = result();
  const committed = commitResult();
  const received: { command: GitWorkerCommand; context: GitWorkerContext }[] =
    [];
  const capability = new GitWorkerCapabilityService(
    { action: "commit" },
    assigned,
    async (command, input) => {
      received.push({ command, context: input });
      return command.action === "inspect" ? preview : committed;
    },
  );
  bind(capability);

  await capability.handle("item/tool/call", request());
  assert.equal(await capability.getResult(), null);
  assert.deepEqual(capability.command, { action: "commit" });
  assert.deepEqual(received[0], {
    command: { action: "inspect" },
    context: {
      version: assigned.version,
      requestId: assigned.requestId,
      projectId: assigned.projectId,
      taskId: assigned.taskId,
      repositoryRoot: assigned.repositoryRoot,
      authorization: {
        actions: ["inspect"],
        scope: assigned.authorization.scope,
      },
      verification: {
        inputPaths: assigned.verification!.inputPaths,
        requiredChecks: [],
        results: [],
      },
    },
  });
  const message = "docs: update owned file";
  const [first, repeated] = await Promise.all([
    capability.handle("item/tool/call", commitRequest(message)),
    capability.handle("item/tool/call", {
      ...commitRequest(message),
      callId: "second-commit",
    }),
  ]);
  assert.deepEqual(first, repeated);
  assert.deepEqual(received[1], {
    command: { action: "commit", message },
    context: assigned,
  });
  assert.strictEqual(await capability.getResult(), committed);
  assert.deepEqual(capability.command, { action: "commit", message });
  assert.equal(capability.calls, 2);

  await assert.rejects(
    capability.handle("item/tool/call", commitRequest("Другое сообщение.")),
    denied,
  );
  assert.strictEqual(await capability.getResult(), committed);
  assert.equal(capability.calls, 2);
});

test("commit без завершённого успешного preview не начинает запись", async (t) => {
  await t.test("preview не вызывался", async () => {
    const capability = new GitWorkerCapabilityService(
      { action: "commit" },
      commitContext(),
      async () => assert.fail("Handler не должен вызываться."),
    );
    bind(capability);
    await assert.rejects(
      capability.handle("item/tool/call", commitRequest("docs: fixture")),
      denied,
    );
    assert.equal(capability.calls, 0);
    assert.equal(await capability.getResult(), null);
  });
  await t.test("preview ещё выполняется", async () => {
    const pending = Promise.withResolvers<Result>();
    const commands: string[] = [];
    const capability = new GitWorkerCapabilityService(
      { action: "commit" },
      commitContext(),
      async (command) => {
        commands.push(command.action);
        return pending.promise;
      },
    );
    bind(capability);
    const preview = capability.handle("item/tool/call", request());
    await assert.rejects(
      capability.handle("item/tool/call", commitRequest("docs: fixture")),
      denied,
    );
    pending.resolve(result());
    await preview;
    await capability.drain();
    assert.deepEqual(commands, ["inspect"]);
    assert.equal(await capability.getResult(), null);
  });
  await t.test("preview заблокирован", async () => {
    const preview: Result = {
      ...result(),
      status: "blocked",
      errorCode: "repository_changed",
    };
    const capability = new GitWorkerCapabilityService(
      { action: "commit" },
      commitContext(),
      async () => preview,
    );
    bind(capability);
    await capability.handle("item/tool/call", request());
    assert.strictEqual(await capability.getResult(), preview);
    await assert.rejects(
      capability.handle("item/tool/call", commitRequest("docs: fixture")),
      denied,
    );
    assert.equal(capability.calls, 1);
  });
});

test("сгенерированное сообщение не позволяет передать дополнительные полномочия или пустой текст", async (t) => {
  for (const { name, args } of [
    { name: "нет сообщения", args: {} },
    { name: "пробелы", args: { message: " " } },
    { name: "слишком длинное сообщение", args: { message: "x".repeat(4097) } },
    { name: "NUL в сообщении", args: { message: "bad\0message" } },
    { name: "неверный тип сообщения", args: { message: 123 } },
    {
      name: "подмена области",
      args: { message: "docs: fixture", scope: { mode: "all" } },
    },
    {
      name: "подмена проверок",
      args: { message: "docs: fixture", verification: {} },
    },
  ]) {
    await t.test(name, async () => {
      const capability = new GitWorkerCapabilityService(
        { action: "commit" },
        commitContext(),
        async () => result(),
      );
      bind(capability);
      await capability.handle("item/tool/call", request());
      await assert.rejects(
        capability.handle(
          "item/tool/call",
          request({ tool: "git_commit", arguments: args }),
        ),
        denied,
      );
      assert.equal(capability.calls, 1);
      assert.deepEqual(capability.command, { action: "commit" });
    });
  }
});

test("noop является успешным tool result и сохраняется как фактический commit", async () => {
  const expected = commitResult("noop");
  const capability = new GitWorkerCapabilityService(
    { action: "commit", message: "docs: fixture" },
    commitContext(),
    async () => expected,
  );
  bind(capability);
  assert.deepEqual(await capability.handle("item/tool/call", commitRequest()), {
    contentItems: [{ type: "inputText", text: JSON.stringify(expected) }],
    success: true,
  });
  assert.strictEqual(await capability.getResult(), expected);
});

test("drain дожидается уже начатого commit и сохраняет его результат после прекращения запросов", async () => {
  const pending = Promise.withResolvers<Result>();
  const expected = commitResult();
  const capability = new GitWorkerCapabilityService(
    { action: "commit" },
    commitContext(),
    async (command) =>
      command.action === "inspect" ? result() : pending.promise,
  );
  bind(capability);
  await capability.handle("item/tool/call", request());
  assert.equal(await capability.getResult(), null);
  const response = capability.handle(
    "item/tool/call",
    commitRequest("docs: fixture"),
  );
  let drained = false;
  const draining = capability.drain().then(() => {
    drained = true;
  });
  await Promise.resolve();
  assert.equal(drained, false);
  pending.resolve(expected);
  await Promise.all([response, draining]);
  assert.equal(drained, true);
  assert.strictEqual(await capability.getResult(), expected);
  assert.equal(capability.calls, 2);
});

test("ошибка начатого commit не заменяется успешным preview и не повторяет запись", async () => {
  const failure = new Error("Ошибка commit fixture.");
  const capability = new GitWorkerCapabilityService(
    { action: "commit" },
    commitContext(),
    async (command) => {
      if (command.action === "inspect") return result();
      throw failure;
    },
  );
  bind(capability);
  await capability.handle("item/tool/call", request());
  await assert.rejects(
    capability.handle("item/tool/call", commitRequest("docs: fixture")),
    (error) => error === failure,
  );
  await capability.drain();
  await assert.rejects(capability.getResult(), (error) => error === failure);
  await assert.rejects(
    capability.handle("item/tool/call", commitRequest("docs: fixture")),
    (error) => error === failure,
  );
  assert.equal(capability.calls, 2);
});

test("после нарушения capability последующий корректный commit также запрещён", async () => {
  const capability = new GitWorkerCapabilityService(
    { action: "commit", message: "docs: fixture" },
    commitContext(),
    async () => assert.fail("После нарушения запись запрещена."),
  );
  bind(capability);
  await assert.rejects(
    capability.handle("item/tool/call", request({ tool: "git_push" })),
    denied,
  );
  await assert.rejects(
    capability.handle("item/tool/call", commitRequest()),
    denied,
  );
  assert.equal(capability.calls, 0);
});
