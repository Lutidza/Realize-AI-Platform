/**
 * @file tests/int/developmentRuntime.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет режимы запуска, конфликты портов и завершение дочерних процессов без модели.
 */

import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { readDevelopmentRuntime } from "../../scripts/runtime/readDevelopmentRuntime.config";
import {
  superviseDevelopment,
  verifyDevelopmentPorts,
} from "../../scripts/runtime/superviseDevelopment.service";
import type { DevelopmentRuntime } from "../../scripts/runtime/DevelopmentRuntime.types";

const localEnvironment = {
  NODE_ENV: "development" as const,
  REALIZE_AI_RUNTIME_MODE: "local-development",
  REALIZE_AI_CONTROL_PLANE_TOKEN: "t".repeat(32),
  REALIZE_AI_EXECUTION_SIGNING_SECRET: "s".repeat(32),
  DATABASE_URI: "postgresql://unused.invalid/fixture",
};
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const waitForFile = async (path: string) => {
  for (let i = 0; i < 100; i++) {
    if (
      await access(path).then(
        () => true,
        () => false,
      )
    )
      return;
    await delay(20);
  }
  throw new Error("Fixture child did not become ready.");
};

describe("development runtime configuration", () => {
  it("starts the three local processes and shares the effective control-plane URL", () => {
    const runtime = readDevelopmentRuntime(
      { ...localEnvironment, REALIZE_AI_CONTROL_PLANE_PORT: "3188" },
      ["--port", "3017", "--webpack"],
    );
    expect(runtime.processes.map((item) => item.name)).toEqual([
      "web",
      "control-plane",
      "execution-worker",
    ]);
    expect(runtime.environment.REALIZE_AI_CONTROL_PLANE_URL).toBe(
      "http://127.0.0.1:3188",
    );
    expect(runtime.processes[0].args).toEqual(
      expect.arrayContaining(["--port", "3017", "--webpack"]),
    );
    expect(runtime.ports.map((item) => item.port)).toEqual([3017, 3188]);
    expect(runtime.processes[2].drain).toBe(true);
  });

  it.each([
    { REALIZE_AI_RUNTIME_MODE: "central-control-plane" },
    {
      REALIZE_AI_RUNTIME_MODE: "local-development",
      REALIZE_AI_RUNTIME_ISOLATED: "true",
    },
  ])(
    "keeps AI services out of central/isolated starts without requiring their credentials",
    (environment) => {
      expect(
        readDevelopmentRuntime({
          NODE_ENV: "development",
          ...environment,
        }).processes.map((item) => item.name),
      ).toEqual(["web"]);
    },
  );

  it("pins the default port and preserves IPv6 host arguments", () => {
    const runtime = readDevelopmentRuntime({ NODE_ENV: "development" }, [
      "-H",
      "::1",
    ]);
    expect(runtime.processes[0].args.slice(-2)).toEqual(["--port", "3000"]);
    expect(runtime.ports[0].host).toBe("::1");
  });

  it("rejects mismatched local addresses and colliding ports before any service can start", () => {
    expect(() =>
      readDevelopmentRuntime({
        ...localEnvironment,
        REALIZE_AI_CONTROL_PLANE_URL: "https://elsewhere.invalid",
      }),
    ).toThrow("не совпадает");
    expect(() =>
      readDevelopmentRuntime(localEnvironment, ["-p", "3100"]),
    ).toThrow("разные порты");
    expect(() =>
      readDevelopmentRuntime(localEnvironment, ["--port", "0"]),
    ).toThrow("Порт приложения");
    expect(() =>
      readDevelopmentRuntime(localEnvironment, ["--experimental-https"]),
    ).toThrow("HTTPS");
  });

  it("shows Next help without starting an executor or requiring AI credentials", () => {
    const runtime = readDevelopmentRuntime(
      { NODE_ENV: "development", REALIZE_AI_RUNTIME_MODE: "local-development" },
      ["--help"],
    );
    expect(runtime.local).toBe(false);
    expect(runtime.ports).toEqual([]);
    expect(runtime.processes).toHaveLength(1);
  });
});

describe("development process supervision", () => {
  it.runIf(process.platform !== "win32")(
    "cleans descendants when their service parent crashes",
    async () => {
      const cwd = await mkdtemp(join(tmpdir(), "realize-development-"));
      directories.push(cwd);
      const descendant =
        "const fs=require('fs');process.on('SIGTERM',()=>{fs.writeFileSync('descendant-stopped','');process.exit(0)});fs.writeFileSync('descendant-ready','');setInterval(()=>{},1000)";
      const parent = `const fs=require('fs');require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'});setInterval(()=>{if(fs.existsSync('descendant-ready'))process.exit(7)},20)`;
      const runtime: DevelopmentRuntime = {
        cwd,
        environment: process.env,
        local: false,
        ports: [],
        processes: [{ name: "web", args: ["-e", parent] }],
      };
      expect(
        await superviseDevelopment({
          runtime,
          signal: new AbortController().signal,
          log: () => undefined,
        }),
      ).toBe(1);
      await expect(
        access(join(cwd, "descendant-stopped")),
      ).resolves.toBeUndefined();
    },
    10000,
  );

  it("refuses an occupied port without stopping its owner", async () => {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("Missing fixture address.");
    try {
      await expect(
        verifyDevelopmentPorts([
          { name: "web", host: "127.0.0.1", port: address.port },
        ]),
      ).rejects.toThrow("недоступен");
      expect(server.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("waits for the active executor to persist its result on graceful stop", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "realize-development-"));
    directories.push(cwd);
    const runtime: DevelopmentRuntime = {
      cwd,
      environment: process.env,
      local: true,
      ports: [],
      processes: [
        {
          name: "web",
          args: [
            "-e",
            "require('fs').writeFileSync('web-ready','');process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)",
          ],
        },
        {
          name: "execution-worker",
          drain: true,
          args: [
            "-e",
            "const fs=require('fs');process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync('result','completed');process.exit(0)},300));fs.writeFileSync('worker-ready','');setInterval(()=>{},1000)",
          ],
        },
      ],
    };
    const signal = new AbortController();
    const running = superviseDevelopment({
      runtime,
      signal: signal.signal,
      log: () => undefined,
    });
    try {
      await Promise.all([
        waitForFile(join(cwd, "web-ready")),
        waitForFile(join(cwd, "worker-ready")),
      ]);
      signal.abort();
      expect(await running).toBe(0);
      expect(await readFile(join(cwd, "result"), "utf8")).toBe("completed");
    } finally {
      signal.abort();
      await running;
    }
  });

  it("stops sibling services and returns failure when one child exits", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "realize-development-"));
    directories.push(cwd);
    const runtime: DevelopmentRuntime = {
      cwd,
      environment: process.env,
      local: true,
      ports: [],
      processes: [
        {
          name: "web",
          args: [
            "-e",
            "const fs=require('fs');process.on('SIGTERM',()=>{fs.writeFileSync('stopped','');process.exit(0)});fs.writeFileSync('ready','');setInterval(()=>{},1000)",
          ],
        },
        {
          name: "control-plane",
          args: [
            "-e",
            "const fs=require('fs');const t=setInterval(()=>{if(fs.existsSync('ready')){clearInterval(t);process.exit(7)}},20)",
          ],
        },
      ],
    };
    const signal = new AbortController();
    const running = superviseDevelopment({
      runtime,
      signal: signal.signal,
      log: () => undefined,
    });
    try {
      expect(await running).toBe(1);
      await expect(access(join(cwd, "stopped"))).resolves.toBeUndefined();
    } finally {
      signal.abort();
      await running;
    }
  });

  it("never starts the executor when a prerequisite exits before readiness", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "realize-development-"));
    directories.push(cwd);
    const runtime: DevelopmentRuntime = {
      cwd,
      environment: process.env,
      local: true,
      ports: [],
      processes: [
        {
          name: "web",
          readyUrl: "http://127.0.0.1:1/health",
          args: ["-e", "setTimeout(()=>process.exit(2),100)"],
        },
        {
          name: "execution-worker",
          drain: true,
          args: ["-e", "require('fs').writeFileSync('claimed','')"],
        },
      ],
    };
    expect(
      await superviseDevelopment({
        runtime,
        signal: new AbortController().signal,
        log: () => undefined,
      }),
    ).toBe(1);
    await expect(access(join(cwd, "claimed"))).rejects.toThrow();
  });
});
