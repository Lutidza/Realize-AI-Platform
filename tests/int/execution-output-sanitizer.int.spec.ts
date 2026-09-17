// @vitest-environment node
/**
 * @file tests/int/execution-output-sanitizer.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-15
 * @description Проверяет безопасную диагностику, окружение и завершение процессов проверок исполнителя.
 */

import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeExecutionOutput } from "../../services/ai-execution-worker/src/sanitizeExecutionOutput.util";
import { runExecutionCheck } from "../../services/ai-execution-worker/src/checkRunner";

const mock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mock.spawn(...args),
}));

const providerToken = (suffix: string) =>
  ["sk", "proj", "synthetic".repeat(6) + suffix].join("-");

const createChild = () =>
  Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
    pid: 765432,
  });

const checkInput = {
  command: "npm run typecheck",
  repositoryRoot: "/fixture-root",
  workspace: "/fixture-workspace",
};

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Безопасный вывод исполнителя", () => {
  it("маскирует известные ключи, JWT и Authorization, сохраняя понятный отказ scope", () => {
    const tokens = [
      providerToken("one"),
      ["ghp", "synthetic".repeat(6)].join("_"),
      ["github", "pat", "synthetic".repeat(6)].join("_"),
      ["sk", "live", "synthetic".repeat(6)].join("_"),
      [
        "eyJmaXh0dXJlIjp0cnVlfQ",
        "c3ludGhldGljLXBheWxvYWQ",
        "c3ludGhldGljLXNpZw",
      ].join("."),
    ];
    const bearer = "opaque-fixture-bearer";
    const basic = Buffer.from("fixture:synthetic-password").toString("base64");
    const reason =
      "Нельзя изменить src/plugins/index.ts: путь не входит в утверждённый scope.";
    const cleaned = sanitizeExecutionOutput(
      `${reason}\n${tokens.join("\n")}\nAuthorization: Bearer ${bearer}\nBasic ${basic}`,
      [],
    );
    expect(cleaned).toContain(reason);
    for (const token of [...tokens, bearer, basic])
      expect(cleaned).not.toContain(token);
    expect(cleaned).toContain("Authorization: Bearer [redacted-token]");
  });

  it("скрывает URL credentials и подписанные параметры, оставляя адрес диагностируемого сервиса", () => {
    const uri = new URL("postgresql://localhost:5432/fixture_database");
    uri.username = "fixture-user";
    uri.password = "fixture-private-password";
    uri.searchParams.set("access_token", "fixture-access-value");
    uri.searchParams.set("X-Amz-Signature", "fixture-signature-value");
    uri.searchParams.set("sslmode", "require");
    const cleaned = sanitizeExecutionOutput(
      `Соединение отклонено: ${uri.href}`,
      [],
    );
    expect(cleaned).toContain(
      "postgresql://[redacted-credentials]@localhost:5432/fixture_database",
    );
    expect(cleaned).toContain("sslmode=require");
    for (const value of [
      "fixture-user",
      "fixture-private-password",
      "fixture-access-value",
      "fixture-signature-value",
    ]) {
      expect(cleaned).not.toContain(value);
    }
  });

  it("удаляет PEM и значения секретных полей JSON/окружения до ограничения длины", () => {
    const begin = ["-----BEGIN", "OPENSSH PRIVATE KEY-----"].join(" ");
    const end = ["-----END", "OPENSSH PRIVATE KEY-----"].join(" ");
    const keyBody = "synthetic-private-material".repeat(300);
    const raw = `${begin}\n${keyBody}\n${end}\n{"refresh_token":"fixture-refresh", "password": "fixture-password"}\nPAYLOAD_SECRET='fixture-config-secret'\nФайл src/components/card.tsx отсутствует.`;
    const cleaned = sanitizeExecutionOutput(raw, []);
    expect(cleaned).toContain("[redacted-private-key]");
    expect(cleaned).toContain("Файл src/components/card.tsx отсутствует.");
    for (const value of [
      keyBody,
      "fixture-refresh",
      "fixture-password",
      "fixture-config-secret",
    ]) {
      expect(cleaned).not.toContain(value);
    }
    expect(sanitizeExecutionOutput(`${begin}\n${keyBody}`, [])).toBe(
      "[redacted-private-key]",
    );
  });

  it("сохраняет head4000/tail8000 и игнорирует пустые roots при замене вложенных путей", () => {
    expect(
      sanitizeExecutionOutput("Ошибка /fixture/root/worktree/src/card.tsx", [
        "",
        " ",
        "/fixture/root",
        "/fixture/root/worktree",
      ]),
    ).toBe("Ошибка [workspace]/src/card.tsx");
    const raw = "HEAD:" + "x".repeat(10_000) + ":TAIL";
    const summary = sanitizeExecutionOutput(raw, []);
    const check = sanitizeExecutionOutput(raw, [], "check");
    expect(summary.length).toBe(4_000);
    expect(summary.startsWith("HEAD:")).toBe(true);
    expect(check.length).toBe(8_000);
    expect(check.endsWith(":TAIL")).toBe(true);
    expect(
      sanitizeExecutionOutput(
        "x".repeat(3_989) + " " + providerToken("boundary"),
        [],
      ),
    ).not.toContain("sk-proj");
  });

  it("checkRunner сохраняет hash исходного вывода, хотя разные секреты дают одинаковый безопасный текст", async () => {
    const command = "npm run typecheck";
    const outputs = [providerToken("one"), providerToken("two")].map(
      (token) => `Ошибка типов в /fixture-workspace/src/card.tsx; ${token}`,
    );
    const results = [];
    for (const raw of outputs) {
      mock.spawn.mockImplementationOnce(() => {
        const child = createChild();
        queueMicrotask(() => {
          child.stdout.emit("data", Buffer.from(raw));
          child.emit("exit", 1, null);
          child.emit("close", 1, null);
        });
        return child;
      });
      results.push(
        await runExecutionCheck({
          command,
          repositoryRoot: "/fixture-root",
          workspace: "/fixture-workspace",
        }),
      );
    }
    expect(results[0].outputSummary).toBe(results[1].outputSummary);
    expect(results[0].outputSummary).toContain(
      "Ошибка типов в [workspace]/src/card.tsx",
    );
    expect(results[0].evidenceHash).not.toBe(results[1].evidenceHash);
    for (const [index, result] of results.entries()) {
      expect(result.status).toBe("failed");
      expect(result.evidenceHash).toBe(
        createHash("sha256")
          .update(
            JSON.stringify([
              command,
              "failed",
              outputs[index],
              {
                exitCode: 1,
                signal: null,
                timedOut: false,
              },
            ]),
          )
          .digest("hex"),
      );
    }
    expect(mock.spawn).toHaveBeenCalledWith(
      "npm",
      ["run", "typecheck"],
      expect.objectContaining({
        env: expect.objectContaining({ REALIZE_AI_RUNTIME_ISOLATED: "true" }),
      }),
    );
  });

  it("собирает последний stderr после exit и считает успешным только нормальный close", async () => {
    const child = createChild();
    mock.spawn.mockReturnValueOnce(child);
    const promise = runExecutionCheck(checkInput);
    child.emit("exit", 0, null);
    child.stderr.emit("data", Buffer.from("Последний результат проверки"));
    child.emit("close", 0, null);
    const result = await promise;
    expect(result.status).toBe("passed");
    expect(result.outputSummary).toBe("Последний результат проверки");
    expect(result.outputSummary).not.toContain("execution-check");
  });

  it.each([
    { exitCode: 137, signal: null },
    { exitCode: null, signal: "SIGKILL" },
  ])(
    "сохраняет безопасную причину завершения $exitCode/$signal без предположения об OOM",
    async ({ exitCode, signal }) => {
      const child = createChild();
      mock.spawn.mockReturnValueOnce(child);
      const promise = runExecutionCheck(checkInput);
      child.emit("close", exitCode, signal);
      const result = await promise;
      expect(result.status).toBe("failed");
      expect(result.outputSummary).toContain(
        `exitCode=${exitCode ?? "null"}; signal=${signal ?? "none"}; timedOut=false`,
      );
      expect(result.outputSummary).not.toContain("OOM");
      expect(result.evidenceHash).toBe(
        createHash("sha256")
          .update(
            JSON.stringify([
              checkInput.command,
              "failed",
              "",
              { exitCode, signal, timedOut: false },
            ]),
          )
          .digest("hex"),
      );
    },
  );

  it("ограничивает только build, сохраняет runtime isolation и не наследует provider secrets", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fixture-provider-value");
    vi.stubEnv("CODEX_HOME", "/fixture-private-profile");
    vi.stubEnv("NODE_OPTIONS", "--inspect=1234");
    vi.stubEnv("TURBO_TASKS_AVAILABLE_PARALLELISM", "200");
    for (const command of ["npm run build", "npm run typecheck"]) {
      const child = createChild();
      mock.spawn.mockReturnValueOnce(child);
      const promise = runExecutionCheck({
        ...checkInput,
        command,
        environment:
          command === "npm run build"
            ? {
                TURBO_TASKS_AVAILABLE_PARALLELISM: "100",
                REALIZE_AI_RUNTIME_ISOLATED: "false",
              }
            : undefined,
      });
      child.emit("close", 0, null);
      await promise;
      const options = mock.spawn.mock.lastCall?.[2];
      expect(options.env.REALIZE_AI_RUNTIME_ISOLATED).toBe("true");
      expect(options.env.NODE_ENV).toBe(
        command === "npm run build" ? "production" : "test",
      );
      expect(options.env.TURBO_TASKS_AVAILABLE_PARALLELISM).toBe(
        command === "npm run build" ? "2" : undefined,
      );
      for (const name of ["OPENAI_API_KEY", "CODEX_HOME", "NODE_OPTIONS"]) {
        expect(options.env).not.toHaveProperty(name);
      }
      expect(options).not.toHaveProperty("shell");
      expect(options.detached).toBe(process.platform !== "win32");
    }
  });

  it("отклоняет spawn error после close и отменяет timeout без сигнала несуществующей группе", async () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    const child = createChild();
    mock.spawn.mockReturnValueOnce(child);
    const error = Object.assign(new Error("spawn npm ENOENT"), {
      code: "ENOENT",
    });
    const promise = runExecutionCheck({ ...checkInput, timeoutMs: 100 });
    const rejected = expect(promise).rejects.toBe(error);
    child.emit("error", error);
    child.emit("close", -2, null);
    await rejected;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(kill).not.toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("не завершает timeout cleanup до SIGKILL даже после успешного close корневого процесса", async () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    const child = createChild();
    mock.spawn.mockReturnValueOnce(child);
    let completed = false;
    const promise = runExecutionCheck({ ...checkInput, timeoutMs: 100 }).then(
      (result) => {
        completed = true;
        return result;
      },
    );
    await vi.advanceTimersByTimeAsync(100);
    child.emit("close", 0, null);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;
    const expectedSignals = ["SIGTERM", "SIGKILL"];
    if (process.platform !== "win32") {
      expect(kill.mock.calls).toEqual(
        expectedSignals.map((signal) => [-child.pid, signal]),
      );
      expect(child.kill).not.toHaveBeenCalled();
    } else {
      expect(child.kill.mock.calls).toEqual(
        expectedSignals.map((signal) => [signal]),
      );
      expect(kill).not.toHaveBeenCalled();
    }
    expect(result.status).toBe("failed");
    expect(result.outputSummary).toContain(
      "exitCode=0; signal=none; timedOut=true",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it.runIf(process.platform === "linux")(
    "завершает реального потомка, который игнорирует SIGTERM и переживает родителя",
    async () => {
      const { spawn } =
        await vi.importActual<typeof import("node:child_process")>(
          "node:child_process",
        );
      const descendantScript = `process.on('SIGTERM', () => {}); process.send(process.pid); setInterval(() => {}, 1000);`;
      const parentScript = `const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }); child.once('message', pid => process.stdout.write('descendant-ready:' + pid + '\\n'));`;
      let parentPid: number | undefined;
      let descendantPid: number | undefined;
      mock.spawn.mockImplementationOnce((_binary, _args, options) => {
        const child = spawn(process.execPath, ["-e", parentScript], {
          ...options,
          cwd: process.cwd(),
        });
        parentPid = child.pid;
        child.stdout?.on("data", (chunk: Buffer) => {
          const match = chunk.toString().match(/descendant-ready:(\d+)/);
          if (match) descendantPid = Number(match[1]);
        });
        return child;
      });
      try {
        const result = await runExecutionCheck({
          ...checkInput,
          timeoutMs: 2_000,
        });
        expect(descendantPid).toBeGreaterThan(0);
        expect(result.status).toBe("failed");
        expect(result.outputSummary).toContain("timedOut=true");
        await vi.waitFor(
          async () => {
            try {
              const stat = await readFile(
                `/proc/${descendantPid}/stat`,
                "utf8",
              );
              expect(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0]).toBe(
                "Z",
              );
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                throw error;
            }
          },
          { timeout: 1_000 },
        );
      } finally {
        if (parentPid) {
          try {
            process.kill(-parentPid, "SIGKILL");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          }
        }
      }
    },
    10_000,
  );
});
