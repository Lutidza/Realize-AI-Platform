/**
 * @file tests/int/preview-runtime.int.spec.ts
 * @owner tests/int
 * @purpose Verifies safe ownership-based cleanup of a renamed standalone Next process.
 */

import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { stopLocalPreviewProcess } from "../../services/ai-execution-worker/src/previewRuntime";

const temporaryRoots: string[] = [];
const processIDs: number[] = [];

afterEach(async () => {
  for (const processID of processIDs.splice(0)) {
    try {
      process.kill(-processID, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { force: true, recursive: true });
  }
});

describe("local preview process cleanup", () => {
  it("stops a Next process that renamed its command while retaining the owned cwd", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "realize-preview-process-"));
    temporaryRoots.push(workspace);
    const child = spawn(
      process.execPath,
      [
        "-e",
        'process.title = "next-server (v16.3.1)"; setInterval(() => {}, 1000);',
      ],
      {
        cwd: workspace,
        detached: true,
        stdio: "ignore",
      },
    );
    child.unref();
    const processID = child.pid;
    if (!processID) throw new Error("Preview test process received no PID.");
    processIDs.push(processID);

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    await stopLocalPreviewProcess(processID, workspace);
    await expect(access(`/proc/${processID}`)).rejects.toMatchObject({
      code: "ENOENT",
    });
    processIDs.splice(processIDs.indexOf(processID), 1);
  });
});
