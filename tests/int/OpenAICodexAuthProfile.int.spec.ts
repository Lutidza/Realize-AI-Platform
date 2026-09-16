/**
 * @file tests/int/OpenAICodexAuthProfile.int.spec.ts
 * @version 1.1.2
 * @date 2026-09-16
 * @description Проверяет сохранение WIF read-deny при запуске и возобновлении сессий и безопасные ошибки авторизации.
 */

// @vitest-environment node

import type { RunTurnInput } from "@realize/ai-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({
  request: vi.fn(),
  close: vi.fn(),
  fail: false,
}));
vi.mock("../../packages/codex-adapter/src/JsonLineRpcClient.adapter", () => ({
  JsonLineRPCClient: class {
    start() {}
    notify() {}
    request = rpc.request;
    close = rpc.close;
    async *getNotifications() {
      yield {
        method: "turn/completed",
        params: {
          threadId: "fixture-thread",
          turn: {
            id: "fixture-turn",
            status: rpc.fail ? "failed" : "completed",
            error: { message: "fixture-sensitive-upstream-detail" },
            items: [],
          },
        },
      };
    }
  },
}));
import { OpenAICodexAdapter } from "../../packages/codex-adapter/src/OpenAICodexAdapter";

beforeEach(() => {
  rpc.fail = false;
  rpc.request
    .mockReset()
    .mockImplementation(async (method: string) =>
      method.startsWith("thread/")
        ? { thread: { id: "fixture-thread" } }
        : method === "turn/start"
          ? { turn: { id: "fixture-turn" } }
          : {},
    );
  rpc.close.mockReset().mockResolvedValue(undefined);
});

const input: RunTurnInput = {
  cwd: "/fixture-workspace",
  developerInstructions: "fixture-policy",
  prompt: "fixture",
  runID: "fixture-run",
};

describe("OpenAICodexAdapter auth profiles", () => {
  it.each([
    ["review-readonly", undefined, "realize_wif_readonly"],
    ["review-readonly", "fixture-existing", "realize_wif_readonly"],
    ["code-workspace-write", undefined, "realize_wif_workspace"],
    ["code-workspace-write", "fixture-existing", "realize_wif_workspace"],
  ] as const)(
    "сохраняет WIF deny профиль %s при thread %s",
    async (sandboxProfile, threadID, permissionProfile) => {
      const adapter = new OpenAICodexAdapter({
        environment: {
          NODE_ENV: "test",
          CODEX_HOME: "/fixture-selected-profile",
          OPENAI_FEDERATION_RULE_ID: "idpm_fixture",
          OPENAI_IDENTITY_TOKEN_FILE: "/fixture-protected/identity",
        },
      });
      const events = [];
      for await (const event of adapter.runTurn({
        ...input,
        sandboxProfile,
        threadID,
      }))
        events.push(event);
      const call = rpc.request.mock.calls.find(
        ([method]) => method === (threadID ? "thread/resume" : "thread/start"),
      );
      expect(call?.[1]).toMatchObject({
        config: { default_permissions: permissionProfile },
      });
      expect(call?.[1]).not.toHaveProperty("sandbox");
      expect(events.at(-1)?.type).toBe("assistant.completed");
      expect(rpc.close).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["accessToken", "workloadIdentity"])(
    "не выдаёт raw turn error для %s",
    async (mode) => {
      rpc.fail = true;
      const adapter = new OpenAICodexAdapter({
        environment: {
          NODE_ENV: "test",
          CODEX_HOME: "/fixture-selected-profile",
          ...(mode === "accessToken"
            ? { CODEX_ACCESS_TOKEN: "fixture-token" }
            : { OPENAI_FEDERATION_RULE_ID: "idpm_fixture" }),
        },
      });
      const events = [];
      for await (const event of adapter.runTurn(input)) events.push(event);
      expect(events.at(-1)).toEqual({
        type: "run.failed",
        message:
          "Не удалось выполнить запрос Codex. Проверьте подключение в разделе интеграций.",
      });
    },
  );
});
