// @vitest-environment node

/**
 * @file tests/int/runtime-primitives.int.spec.ts
 * @version 2026-08-17
 * @description Verifies queueing, event replay and output redaction primitives deterministically.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { AsyncQueue } from "../../packages/codex-adapter/src/AsyncQueue";
import { redactPayload } from "../../packages/payload-ai-plugin/src/endpoints/redaction";
import { ControlPlaneClient } from "../../packages/payload-ai-plugin/src/runtime/controlPlaneClient";
import { RunStore } from "../../services/ai-control-plane/src/runStore";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("control-plane runtime primitives", () => {
  it("preserves async queue order and completion", async () => {
    const queue = new AsyncQueue<string>();
    const iterator = queue[Symbol.asyncIterator]();
    queue.push("first");
    queue.push("second");
    queue.end();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: "first",
    });
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: "second",
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it("orders, replays and publishes run events", () => {
    const store = new RunStore();
    store.create({ id: "run-1", prompt: "inspect" });
    const subscriber = vi.fn();
    const unsubscribe = store.subscribe("run-1", subscriber);

    store.append("run-1", "run.started", {});
    store.append("run-1", "assistant.delta", { delta: "ok" });
    unsubscribe();

    expect(store.getEvents("run-1", 1)).toHaveLength(1);
    expect(store.getEvents("run-1", 0).map((event) => event.sequence)).toEqual([
      1, 2,
    ]);
    expect(subscriber).toHaveBeenCalledTimes(2);
  });

  it("redacts nested credentials before persistence", () => {
    const githubLikeToken = ["ghp", "_", "123456789012345678901234567890"].join(
      "",
    );
    const openAILikeToken = ["sk", "-proj-", "abcdefghijklmnop"].join("");

    expect(
      redactPayload({
        content: `token ${githubLikeToken}`,
        nested: { values: [openAILikeToken] },
      }),
    ).toEqual({
      content: "token [REDACTED]",
      nested: { values: ["[REDACTED]"] },
    });
  });

  it("requires an authenticated control-plane readiness response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ state: "ready" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new ControlPlaneClient("http://127.0.0.1:3100", "").health(),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(
      new ControlPlaneClient(
        "http://127.0.0.1:3100",
        "control-plane-test-token-value-2026",
      ).health(),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/v1/status", "http://127.0.0.1:3100"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer control-plane-test-token-value-2026",
        }),
      }),
    );
  });
});
