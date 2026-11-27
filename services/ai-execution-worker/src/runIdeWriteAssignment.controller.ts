/**
 * @file services/ai-execution-worker/src/runIdeWriteAssignment.controller.ts
 * @version 1.0.0
 * @date 2026-11-27
 * @description Отдельная точка входа Code Lane для одного разрешения локальной очереди IDE.
 * @see documentation/specifications/internal-mcp.md
 */
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { executeIdeWriteAssignment } from "./executeIdeWriteAssignment.service";

const stop = new AbortController();
process.once("SIGTERM", () => stop.abort());
process.once("disconnect", () => stop.abort());
process.once("message", async (input: unknown) => {
  let response;
  try {
    const { assignment, workspaceRoot } = z
      .strictObject({ workspaceRoot: z.string(), assignment: z.unknown() })
      .parse(input);
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const receipt = await executeIdeWriteAssignment(
      root,
      workspaceRoot,
      assignment,
      stop.signal,
    );
    response = { status: "completed", report: JSON.stringify(receipt) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    response = {
      status: "blocked",
      report: /^assignment_[a-z_]+(?:$|:)/.test(message)
        ? message.slice(0, 4000)
        : "assignment_write_verification_failed",
    };
  }
  if (process.connected) process.send?.(response, () => process.disconnect?.());
});
