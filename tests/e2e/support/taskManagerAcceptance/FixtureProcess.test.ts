/**
 * @file tests/e2e/support/taskManagerAcceptance/FixtureProcess.test.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет process ownership fixture, bounded остановку и отсутствие секретов в output.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";
import {
  createFixtureProcessStarter,
  readFixtureProcessIdentity,
  startFixtureProcess,
} from "./FixtureProcess.adapter";
import type {
  FixtureProcessHandle,
  FixtureProcessIdentity,
} from "./FixtureProcess.types";

const startFast = createFixtureProcessStarter({
  termGraceMs: 120,
  killWaitMs: 1200,
  pollMs: 10,
});
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH };

async function temporaryDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "task-fixture-process-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function ready(handle: FixtureProcessHandle) {
  await Promise.race([
    once(handle.child.stdout, "data"),
    handle.done.then(() => {
      throw new Error("fixture child exited before readiness");
    }),
  ]);
}

async function cleanOwnChild(handle: FixtureProcessHandle) {
  // Используется только для собственных process tests с намеренно сломанным identity reader.
  const pid = handle.child.pid;
  if (
    pid &&
    handle.child.exitCode === null &&
    handle.child.signalCode === null &&
    readFixtureProcessIdentity(pid)
  )
    process.kill(-pid, "SIGKILL");
  await handle.done;
}

test("normal and failing Node commands drain output before quiescence", async () => {
  await temporaryDirectory(async (directory) => {
    for (const code of [0, 7]) {
      const logFile = join(directory, `result-${code}.log`);
      const handle = startFixtureProcess(
        ["--eval", `console.log('finished'); process.exitCode = ${code}`],
        { env, logFile },
      );
      assert.equal(await handle.done, code);
      assert.deepEqual(await handle.stop(), { quiescent: true });
      assert.equal(await readFile(logFile, "utf8"), "finished\n");
      assert.equal(await handle.stop(), await handle.stop());
      assert.deepEqual(await handle.confirmQuiescence(), { quiescent: true });
    }
  });
});

test("nonexistent executable settles fast spawn failure without rejection", async () => {
  await temporaryDirectory(async (directory) => {
    const handle = createFixtureProcessStarter({
      executable: join(directory, "missing-node"),
      termGraceMs: 50,
      killWaitMs: 50,
      pollMs: 5,
    })([], { env, logFile: join(directory, "spawn.log") });
    assert.equal(await handle.done, null);
    assert.deepEqual(await handle.stop(), { quiescent: true });
    assert.equal(await readFile(join(directory, "spawn.log"), "utf8"), "");
  });
});

test("TERM interruption waits for child stream and log FD closure", async () => {
  await temporaryDirectory(async (directory) => {
    const logFile = join(directory, "term.log");
    const handle = startFast(
      [
        "--eval",
        "process.on('SIGTERM', () => { console.log('term'); process.exit(0) }); console.log('ready'); setInterval(() => {}, 1000)",
      ],
      { env, logFile },
    );
    try {
      await ready(handle);
      assert.deepEqual(await handle.stop(), { quiescent: true });
      assert.equal(await handle.done, 0);
      assert.match(await readFile(logFile, "utf8"), /ready\nterm\n/);
      const size = (await stat(logFile)).size;
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal((await stat(logFile)).size, size);
    } finally {
      await cleanOwnChild(handle);
    }
  });
});

test("ignored TERM escalates to KILL and awaits real disappearance", async () => {
  await temporaryDirectory(async (directory) => {
    const handle = startFast(
      [
        "--eval",
        "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => console.log('alive'), 10)",
      ],
      { env, logFile: join(directory, "kill.log") },
    );
    try {
      await ready(handle);
      assert.deepEqual(await handle.stop(), { quiescent: true });
      assert.equal(await handle.done, null);
      assert.equal(handle.child.signalCode, "SIGKILL");
      const identity = readFixtureProcessIdentity(handle.child.pid!);
      assert.ok(!identity || ["Z", "X"].includes(identity.state));
    } finally {
      await cleanOwnChild(handle);
    }
  });
});

test("leader exit still owns a live grandchild writer in its session", async () => {
  await temporaryDirectory(async (directory) => {
    const writes = join(directory, "writer.log");
    const script = `
      const { spawn } = require('node:child_process');
      const worker = spawn(process.execPath, ['--eval', "const fs = require('node:fs'); process.on('SIGTERM', () => {}); setInterval(() => fs.appendFileSync(process.env.TEST_WRITE_PATH, 'x'), 10); console.log('writer ready')"], { env: process.env, stdio: ['ignore', 'pipe', 'ignore'] });
      worker.stdout.once('data', () => { console.log('leader ready'); setTimeout(() => process.exit(0), 30) });
    `;
    const handle = startFast(["--eval", script], {
      env: { ...env, TEST_WRITE_PATH: writes },
      logFile: join(directory, "leader.log"),
    });
    try {
      await ready(handle);
      assert.equal(await handle.done, 0);
      assert.deepEqual(await handle.stop(), { quiescent: true });
      const contents = await readFile(writes, "utf8");
      assert.ok(contents.length > 0);
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal(await readFile(writes, "utf8"), contents);
    } finally {
      await cleanOwnChild(handle);
    }
  });
});

test("stale leader identity never authorizes a process group signal", async () => {
  await temporaryDirectory(async (directory) => {
    let leader: FixtureProcessIdentity | null = null;
    let stale = false;
    const signals: string[] = [];
    const handle = createFixtureProcessStarter({
      readIdentity(pid) {
        leader = readFixtureProcessIdentity(pid);
        return leader;
      },
      scanProcesses() {
        return {
          processes: leader
            ? [{ ...leader, startTicks: stale ? "0" : leader.startTicks }]
            : [],
          inaccessible: false,
        };
      },
      signalGroup: (_group, signal) => signals.push(signal),
      termGraceMs: 20,
      killWaitMs: 20,
      confirmWaitMs: 20,
      pollMs: 5,
    })(["--eval", "console.log('ready'); setInterval(() => {}, 1000)"], {
      env,
      logFile: join(directory, "stale.log"),
    });
    try {
      await ready(handle);
      stale = true;
      assert.deepEqual(await handle.stop(), {
        quiescent: false,
        reason: "fixture_process_identity_changed",
      });
      assert.deepEqual(signals, []);
      stale = false;
      assert.deepEqual(await handle.confirmQuiescence(), {
        quiescent: false,
        reason: "fixture_process_identity_changed",
      });
      assert.deepEqual(signals, []);
    } finally {
      await cleanOwnChild(handle);
    }
  });
});

test("inaccessible scan keeps cleanup blocked and avoids group signals", async () => {
  await temporaryDirectory(async (directory) => {
    const signals: string[] = [];
    const handle = createFixtureProcessStarter({
      scanProcesses: () => ({ processes: [], inaccessible: true }),
      signalGroup: (_group, signal) => signals.push(signal),
      termGraceMs: 20,
      killWaitMs: 20,
      pollMs: 5,
    })(["--eval", "console.log('ready'); setInterval(() => {}, 1000)"], {
      env,
      logFile: join(directory, "inaccessible.log"),
    });
    try {
      await ready(handle);
      assert.deepEqual(await handle.stop(), {
        quiescent: false,
        reason: "fixture_process_scan_inaccessible",
      });
      assert.deepEqual(signals, []);
    } finally {
      await cleanOwnChild(handle);
    }
  });
});

test("unavailable initial identity never authorizes a process group signal", async () => {
  await temporaryDirectory(async (directory) => {
    const signals: string[] = [];
    const handle = createFixtureProcessStarter({
      readIdentity() {
        throw new Error("identity unavailable");
      },
      signalGroup: (_group, signal) => signals.push(signal),
      termGraceMs: 20,
      killWaitMs: 20,
      pollMs: 5,
    })(["--eval", "console.log('ready'); setInterval(() => {}, 1000)"], {
      env,
      logFile: join(directory, "unknown.log"),
    });
    try {
      await ready(handle);
      assert.deepEqual(await handle.stop(), {
        quiescent: false,
        reason: "fixture_process_identity_unavailable",
      });
      assert.deepEqual(signals, []);
    } finally {
      await cleanOwnChild(handle);
    }
  });
});

test("inaccessible baseline remains blocked after later accessible scans", async () => {
  await temporaryDirectory(async (directory) => {
    let pid: number | undefined;
    let initial = true;
    const handle = createFixtureProcessStarter({
      readIdentity(processId) {
        pid = processId;
        return readFixtureProcessIdentity(processId);
      },
      scanProcesses() {
        if (initial) {
          initial = false;
          return { processes: [], inaccessible: true };
        }
        const identity = pid ? readFixtureProcessIdentity(pid) : null;
        return {
          processes: identity ? [identity] : [],
          inaccessible: false,
        };
      },
      termGraceMs: 20,
      killWaitMs: 40,
      pollMs: 5,
    })(["--eval", "console.log('ready'); setInterval(() => {}, 1000)"], {
      env,
      logFile: join(directory, "baseline.log"),
    });
    try {
      await ready(handle);
      assert.deepEqual(await handle.stop(), {
        quiescent: false,
        reason: "fixture_process_baseline_inaccessible",
      });
      assert.equal(await handle.done, null);
    } finally {
      await cleanOwnChild(handle);
    }
  });
});

test("live descendant in another session blocks quiescence", async () => {
  await temporaryDirectory(async (directory) => {
    const script = `
      const { spawn } = require('node:child_process');
      const worker = spawn(process.execPath, ['--eval', "console.log('ready'); setInterval(() => {}, 1000)"], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
      worker.stdout.once('data', () => { console.log(worker.pid); setInterval(() => {}, 1000) });
    `;
    const handle = startFast(["--eval", script], {
      env,
      logFile: join(directory, "escaped.log"),
    });
    let escaped: FixtureProcessIdentity | null = null;
    try {
      const [chunk] = await once(handle.child.stdout, "data");
      escaped = readFixtureProcessIdentity(Number(String(chunk).trim()));
      assert.ok(escaped);
      // Даёт monitor время зафиксировать ancestry до остановки parent.
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.deepEqual(await handle.stop(), {
        quiescent: false,
        reason: "fixture_process_descendant_escaped",
      });
      assert.ok(readFixtureProcessIdentity(escaped.pid));
    } finally {
      if (escaped) {
        const current = readFixtureProcessIdentity(escaped.pid);
        if (
          current?.bootId === escaped.bootId &&
          current.startTicks === escaped.startTicks
        )
          process.kill(-escaped.groupId, "SIGKILL");
      }
      await cleanOwnChild(handle);
    }
  });
});

test("immediately orphaned detached writer cannot falsely pass quiescence", async () => {
  await temporaryDirectory(async (directory) => {
    const identityFile = join(directory, "orphan.pid");
    const script = `
      const fs = require('node:fs');
      const { spawn } = require('node:child_process');
      const worker = spawn(process.execPath, ['--eval', "setInterval(() => {}, 1000)"], { detached: true, stdio: 'ignore' });
      fs.writeFileSync(process.env.TEST_IDENTITY_FILE, String(worker.pid));
      process.exit(0);
    `;
    const handle = createFixtureProcessStarter({
      termGraceMs: 20,
      killWaitMs: 20,
      // Parent гарантированно выходит между первым snapshot и первым poll.
      pollMs: 1000,
    })(["--eval", script], {
      env: { ...env, TEST_IDENTITY_FILE: identityFile },
      logFile: join(directory, "orphan.log"),
    });
    let escaped: FixtureProcessIdentity | null = null;
    try {
      assert.equal(await handle.done, 0);
      escaped = readFixtureProcessIdentity(
        Number(await readFile(identityFile, "utf8")),
      );
      assert.ok(escaped);
      const result = await handle.stop();
      assert.equal(result.quiescent, false);
      assert.equal(result.reason, "fixture_process_new_identity_unowned");
      assert.ok(readFixtureProcessIdentity(escaped.pid));
    } finally {
      if (escaped) {
        const current = readFixtureProcessIdentity(escaped.pid);
        if (
          current?.bootId === escaped.bootId &&
          current.startTicks === escaped.startTicks
        )
          process.kill(-escaped.groupId, "SIGKILL");
      }
      await cleanOwnChild(handle);
    }
  });
});

test("split secrets, DB password and oversized lines never enter logs", async () => {
  await temporaryDirectory(async (directory) => {
    const logFile = join(directory, "secrets.log");
    const secrets = {
      DATABASE_URI: "postgresql://fixture:encoded%2Bpassword@127.0.0.1/test",
      DATABASE_URL: "postgresql://fixture:encoded%2Bpassword@127.0.0.1/test",
      PAYLOAD_SECRET: "payload-fixture-secret",
      REALIZE_INTEGRATIONS_ENCRYPTION_KEY: "encryption-fixture-key",
      REALIZE_AI_CONTROL_PLANE_TOKEN: "control-fixture-token",
      TASK_BROWSER_PASSWORD: "browser-fixture-password",
    };
    const script = `
      (async () => {
        for (const secret of [...Object.values(${JSON.stringify(secrets)}), 'encoded%2Bpassword', 'encoded+password']) {
          process.stdout.write(secret.slice(0, 4));
          await new Promise(resolve => setTimeout(resolve, 5));
          process.stdout.write(secret.slice(4) + '\\n');
          process.stderr.write(secret.slice(0, 7));
          await new Promise(resolve => setTimeout(resolve, 5));
          process.stderr.write(secret.slice(7) + '\\n');
        }
        process.stdout.write('x'.repeat(65536) + process.env.PAYLOAD_SECRET + '\\n');
        process.stdout.write('safe progress\\n');
      })();
    `;
    const handle = startFast(["--eval", script], {
      env: { ...env, ...secrets },
      logFile,
    });
    assert.equal(await handle.done, 0);
    assert.deepEqual(await handle.stop(), { quiescent: true });
    const output = await readFile(logFile, "utf8");
    for (const value of [
      ...Object.values(secrets),
      "encoded%2Bpassword",
      "encoded+password",
    ])
      assert.ok(!output.includes(value));
    assert.match(output, /\[redacted\]/);
    assert.match(output, /line omitted: too long/);
    assert.match(output, /safe progress/);
  });
});

test("confirmation waits for actual disappearance of a transient unowned process", async () => {
  await temporaryDirectory(async (directory) => {
    const groups: number[] = [];
    const handle = createFixtureProcessStarter({
      signalGroup(groupId, signal) {
        groups.push(groupId);
        process.kill(-groupId, signal);
      },
      termGraceMs: 20,
      killWaitMs: 20,
      confirmWaitMs: 50,
      pollMs: 5,
    })(["--eval", "console.log('ready'); setInterval(() => {}, 1000)"], {
      env,
      logFile: join(directory, "confirmation.log"),
    });
    let transient: ReturnType<typeof spawn> | undefined;
    let identity: FixtureProcessIdentity | null = null;
    try {
      await ready(handle);
      transient = spawn(
        process.execPath,
        ["--eval", "setInterval(() => {}, 1000)"],
        { env, detached: true, stdio: "ignore" },
      );
      await once(transient, "spawn");
      identity = readFixtureProcessIdentity(transient.pid!);
      assert.ok(identity);
      const initial = await handle.stop();
      assert.deepEqual(initial, {
        quiescent: false,
        reason: "fixture_process_new_identity_unowned",
      });
      const signalCount = groups.length;
      assert.deepEqual(await handle.confirmQuiescence(), initial);
      assert.equal(groups.length, signalCount);
      const current = readFixtureProcessIdentity(identity.pid);
      assert.equal(current?.startTicks, identity.startTicks);
      assert.ok(current && !["Z", "X"].includes(current.state));
      const closed = once(transient, "close");
      transient.kill("SIGTERM");
      await closed;
      assert.deepEqual(await handle.confirmQuiescence(), { quiescent: true });
      assert.equal(groups.length, signalCount);
      assert.ok(groups.every((groupId) => groupId === handle.child.pid));
      // Первый stop остаётся идемпотентным снимком; fresh result принадлежит confirm.
      assert.equal(await handle.stop(), initial);
    } finally {
      if (transient && identity) {
        const current = readFixtureProcessIdentity(identity.pid);
        if (
          transient.exitCode === null &&
          transient.signalCode === null &&
          current?.bootId === identity.bootId &&
          current.startTicks === identity.startTicks
        ) {
          const closed = once(transient, "close");
          transient.kill("SIGKILL");
          await closed;
        }
      }
      await cleanOwnChild(handle);
    }
  });
});
