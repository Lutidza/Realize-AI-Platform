# 19. OpenAI Codex integration

## 19.1. Credential model

Первая версия использует platform-owned OpenAI API project/service credentials.

Запрещено:

- просить каждого клиента подключать ChatGPT Pro;
- совместно использовать пользовательский ChatGPT login;
- продавать доступ к одному OpenAI account;
- отдавать API key клиенту;
- хранить key в Payload DB.

## 19.2. Execution adapter

Ввести интерфейс, несмотря на одного провайдера:

```ts
interface CodingAgentAdapter {
  startThread(input: StartThreadInput): Promise<AgentThread>
  resumeThread(threadID: string): Promise<AgentThread>
  runTurn(input: RunTurnInput): AsyncIterable<AgentEvent>
  cancelRun(runID: string): Promise<void>
  getUsage(runID: string): Promise<ModelUsage>
}
```

Реализация первой версии:

```text
OpenAICodexAdapter
```

## 19.3. App Server vs SDK

Для rich product integration используется Codex App Server как worker-side protocol, потому что необходимы:

- conversation/thread lifecycle;
- streamed events;
- approvals;
- tool calls;
- cancellation;
- rich status.

Для отдельных non-interactive CI/review jobs допустим Codex SDK.

App Server никогда не выставляется напрямую в публичный интернет или браузер. Он доступен только локально внутри worker container через stdio/Unix socket либо защищённое внутреннее соединение.

## 19.4. Thread strategy

- один planner thread на Change Request;
- implementer thread может продолжить planner thread только для R1/R2;
- для R3 — implementation thread и независимый reviewer thread;
- security review — отдельный thread/role при protected surfaces;
- thread IDs сохраняются в runtime;
- в UI не показывается скрытый chain-of-thought;
- сохраняются планы, tool summaries, diffs и результаты.

## 19.5. Sandbox profiles

```text
analysis-readonly
implementation-workspace
review-readonly
migration-sandbox
build-sandbox
```

### analysis-readonly

- read-only filesystem;
- no network;
- read tools only.

### implementation-workspace

- write только в worktree и allowlisted roots;
- no network по умолчанию;
- no production credentials;
- no Docker socket;
- no host filesystem.

### migration-sandbox

- доступ только к disposable DB clone;
- no production DB route;
- migration commands only.

## 19.6. Network policy

Network disabled by default.

Временный доступ разрешается только для:

- approved package registry;
- official documentation;
- approved external MCP endpoints;
- vulnerability database;
- internal control plane.

Package installation требует dependency approval и обновления lockfile.

## 19.7. Budget gate

Перед run:

- проверить plan entitlement;
- проверить monthly budget;
- проверить per-change max;
- зарезервировать estimated credits;
- при превышении запросить Budget Override.

Во время run:

- отслеживать usage;
- soft warning;
- hard stop;
- сохранять partial result.

---

