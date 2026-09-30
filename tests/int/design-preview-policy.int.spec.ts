/**
 * @file tests/int/design-preview-policy.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет границы установки, команды и согласованность capture evidence.
 * @see documentation/specifications/design-workshop.md
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  designPreviewRequestSchema,
  designPreviewJobSchema,
} from "@realize/ai-contracts";
import { designWorkspaceFixture } from "./designWorkspace.fixture";
import { designPreviewStorageRoot } from "../../services/ai-execution-worker/src/design-workshop/designPreviewStorageRoot.config";

describe("Design preview contracts", () => {
  it("separates installations without putting credentials into filesystem identity", () => {
    const a = designPreviewStorageRoot(
      "/tmp/previews",
      "postgres://user:fixture-a@localhost:5432/first",
    );
    expect(a).not.toContain("fixture-a");
    expect(a).toBe(
      designPreviewStorageRoot(
        "/tmp/previews",
        "postgres://rotated:fixture-b@localhost:5432/first",
      ),
    );
    expect(a).not.toBe(
      designPreviewStorageRoot(
        "/tmp/previews",
        "postgres://user:fixture-a@localhost:5432/second",
      ),
    );
  });
  it("refuses actor, process and host path overrides", () => {
    const input = {
      revisionId: designWorkspaceFixture().pin.revision.revisionId,
      entryPath: "src/Preview.tsx",
    };
    expect(designPreviewRequestSchema.safeParse(input).success).toBe(true);
    for (const extra of [
      { actorId: "1" },
      { command: "node" },
      { directory: "/tmp/workspace" },
      { entryPath: "/etc/passwd" },
      { entryPath: "src/../../entry.tsx" },
    ])
      expect(
        designPreviewRequestSchema.safeParse({ ...input, ...extra }).success,
      ).toBe(false);
  });
  it("does not describe incomplete or contradictory evidence as completed", () => {
    const source = designWorkspaceFixture().pin;
    const job = {
      jobId: source.revision.revisionId,
      projectId: source.projectId,
      source,
      entryPath: "src/Preview.tsx",
      state: "queued",
      attempt: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10000).toISOString(),
      error: null,
      evidence: null,
    };
    expect(designPreviewJobSchema.safeParse(job).success).toBe(true);
    expect(
      designPreviewJobSchema.safeParse({ ...job, state: "completed" }).success,
    ).toBe(false);
    expect(
      designPreviewJobSchema.safeParse({ ...job, state: "failed" }).success,
    ).toBe(false);
    expect(
      designPreviewJobSchema.safeParse({
        ...job,
        projectId: source.revision.revisionId,
      }).success,
    ).toBe(false);
  });
});
