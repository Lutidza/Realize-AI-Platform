/**
 * @file tests/int/productionBuild.int.spec.ts
 * @version 1.2.1
 * @date 2026-10-18
 * @description Проверяет последовательность production-сборки, обязательность TypeScript и остановку этапов.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runProductionBuild,
  VERIFIED_TYPES_ENVIRONMENT_NAME,
} from "../../scripts/runtime/runProductionBuild.service.mjs";

const mocked = vi.hoisted(() => ({
  spawn: vi.fn(),
  sourceVersion: vi.fn(),
  writeBinding: vi.fn(),
}));
vi.mock(
  "../../.ai/tools/agent-search/src/searchSourceBinding.adapter.mjs",
  () => ({ readSearchSourceVersion: mocked.sourceVersion }),
);
vi.mock(
  "../../.ai/tools/agent-search/src/installedSearchBinding.adapter.mjs",
  () => ({ writeInstalledSearchBinding: mocked.writeBinding }),
);
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    default: { ...actual, spawn: mocked.spawn },
    spawn: mocked.spawn,
  };
});

const createChild = () =>
  Object.assign(new EventEmitter(), { kill: vi.fn(() => true) });
const children: ReturnType<typeof createChild>[] = [];

beforeEach(() => {
  children.length = 0;
  mocked.spawn.mockReset();
  mocked.sourceVersion.mockReset().mockResolvedValue("a".repeat(64));
  mocked.writeBinding.mockReset().mockResolvedValue(undefined);
  mocked.spawn.mockImplementation(() => {
    const child = createChild();
    children.push(child);
    return child;
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("managed production build", () => {
  it("low-memory Next получает отдельный heap только после полной проверки типов", async () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      REALIZE_BUILD_LOW_MEMORY: "true",
      NODE_OPTIONS: "--no-deprecation --max-old-space-size=2048",
    };
    const result = runProductionBuild(
      process.cwd(),
      new AbortController().signal,
      environment,
    );
    await Promise.resolve();
    for (let stage = 0; stage < 3; stage++) {
      children[stage].emit("close", 0, null);
      await Promise.resolve();
    }
    expect(await result).toBe(0);
    const options = mocked.spawn.mock.calls.map(
      ([, , value]) => value.env.NODE_OPTIONS,
    );
    expect(options.slice(0, 2)).toEqual([
      environment.NODE_OPTIONS,
      environment.NODE_OPTIONS,
    ]);
    expect(options[2]).toBe(
      environment.NODE_OPTIONS + " --max-old-space-size=1024",
    );
    expect(environment.NODE_OPTIONS).toBe(
      "--no-deprecation --max-old-space-size=2048",
    );
  });
  it("waits for each close and grants the verified-types flag only to the final child", async () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "development",
      [VERIFIED_TYPES_ENVIRONMENT_NAME]: "1",
      FIXTURE_VALUE: "preserved",
      NEXT_PRIVATE_OUTPUT_TRACE_ROOT: "/",
    };
    const result = runProductionBuild(
      process.cwd(),
      new AbortController().signal,
      environment,
    );
    await Promise.resolve();
    expect(children).toHaveLength(1);
    children[0].emit("exit", 0, null);
    await Promise.resolve();
    expect(children).toHaveLength(1);
    children[0].emit("close", 0, null);
    await Promise.resolve();
    expect(children).toHaveLength(2);
    children[1].emit("close", 0, null);
    await Promise.resolve();
    expect(children).toHaveLength(3);
    children[2].emit("close", 0, null);
    expect(await result).toBe(0);
    expect(mocked.writeBinding).toHaveBeenCalledOnce();

    const calls = mocked.spawn.mock.calls;
    expect(calls.map(([, args]) => args.slice(1))).toEqual([
      ["typegen"],
      ["--noEmit"],
      ["build", "--webpack"],
    ]);
    for (const [index, [binary, , options]] of calls.entries()) {
      expect(binary).toBe(process.execPath);
      expect(options).toMatchObject({
        cwd: process.cwd(),
        detached: false,
        stdio: "inherit",
        env: {
          NODE_ENV: "production",
          FIXTURE_VALUE: "preserved",
          NEXT_PRIVATE_OUTPUT_TRACE_ROOT: process.cwd(),
          REALIZE_BUILD_TRACING_ROOT: process.cwd(),
        },
      });
      expect(options.env[VERIFIED_TYPES_ENVIRONMENT_NAME]).toBe(
        index === 2 ? "1" : undefined,
      );
    }
    expect(environment.NODE_ENV).toBe("development");
    expect(environment[VERIFIED_TYPES_ENVIRONMENT_NAME]).toBe("1");
    expect(environment.NEXT_PRIVATE_OUTPUT_TRACE_ROOT).toBe("/");
  });

  it.each([0, 1, 2])(
    "stops after a nonzero exit at stage %i",
    async (stage) => {
      const result = runProductionBuild(
        process.cwd(),
        new AbortController().signal,
        { NODE_ENV: "test" },
      );
      await Promise.resolve();
      for (let index = 0; index < stage; index += 1) {
        children[index].emit("close", 0, null);
        await Promise.resolve();
      }
      children[stage].emit("close", 7, null);
      expect(await result).toBe(7);
      expect(mocked.writeBinding).not.toHaveBeenCalled();
      expect(children).toHaveLength(stage + 1);
    },
  );

  it("does not treat a signalled process or spawn error as a passed check", async () => {
    const result = runProductionBuild(
      process.cwd(),
      new AbortController().signal,
      { NODE_ENV: "test" },
    );
    await Promise.resolve();
    children[0].emit("error", new Error("fixture spawn failure"));
    children[0].emit("close", null, "SIGTERM");
    expect(await result).toBe(1);
    expect(children).toHaveLength(1);
  });

  it("forwards cancellation without detaching and waits for the active child's close", async () => {
    vi.useFakeTimers();
    const stopping = new AbortController();
    const result = runProductionBuild(process.cwd(), stopping.signal, {
      NODE_ENV: "test",
    });
    await Promise.resolve();
    stopping.abort("SIGTERM");
    expect(children[0].kill).toHaveBeenCalledWith("SIGTERM");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(children[0].kill).toHaveBeenCalledWith("SIGKILL");
    expect(children).toHaveLength(1);
    children[0].emit("close", 0, null);
    expect(await result).toBe(1);
    expect(children).toHaveLength(1);
  });

  it("does not start a child when already cancelled", async () => {
    const stopping = new AbortController();
    stopping.abort("SIGINT");
    expect(
      await runProductionBuild(process.cwd(), stopping.signal, {
        NODE_ENV: "test",
      }),
    ).toBe(1);
    expect(children).toHaveLength(0);
  });
  it("не создаёт installed receipt, если search source изменился во время сборки", async () => {
    mocked.sourceVersion.mockResolvedValueOnce("b".repeat(64));
    const result = runProductionBuild(
      process.cwd(),
      new AbortController().signal,
      { NODE_ENV: "test" },
    );
    await Promise.resolve();
    for (let stage = 0; stage < 3; stage++) {
      children[stage].emit("close", 0, null);
      await Promise.resolve();
    }
    expect(await result).toBe(1);
    expect(mocked.writeBinding).not.toHaveBeenCalled();
  });
});
