// @vitest-environment node

/**
 * @file tests/int/control-plane-context.int.spec.ts
 * @version 2026-08-17
 * @description Verifies the bounded repository Context Pack security policy.
 */

import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createContextSnapshot } from "../../services/ai-control-plane/src/contextSnapshot";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { force: true, recursive: true });
  }
});

describe("createContextSnapshot", () => {
  it("copies allowlisted text while excluding credentials and symlinks", async () => {
    const source = await mkdtemp(join(tmpdir(), "realize-ai-source-"));
    roots.push(source);
    await mkdir(join(source, ".github", "workflows"), { recursive: true });
    await mkdir(join(source, "documentation"), { recursive: true });
    await mkdir(join(source, "services", "control-plane"), {
      recursive: true,
    });
    await writeFile(join(source, "AGENTS.md"), "project rules\n");
    await writeFile(join(source, "compose.yaml"), "services: {}\n");
    await writeFile(join(source, ".env"), "SECRET=do-not-copy\n");
    await writeFile(
      join(source, ".github", "workflows", "ci.yml"),
      "name: CI\n",
    );
    await writeFile(join(source, "documentation", "safe.md"), "safe\n");
    await writeFile(
      join(source, "services", "control-plane", "server.ts"),
      "export {}\n",
    );
    await writeFile(
      join(source, "documentation", "credentials.json"),
      '{"secret":true}\n',
    );
    await symlink(
      join(source, ".env"),
      join(source, "documentation", "linked-secret"),
    );

    const snapshot = await createContextSnapshot(source);
    roots.push(snapshot.root);
    const manifest = JSON.parse(
      await readFile(join(snapshot.root, "CONTEXT_PACK.json"), "utf8"),
    ) as { files: { path: string }[]; totalBytes: number };
    const paths = manifest.files.map((file) => file.path);

    expect(paths).toEqual([
      "AGENTS.md",
      "compose.yaml",
      ".github/workflows/ci.yml",
      "documentation/safe.md",
      "services/control-plane/server.ts",
    ]);
    expect(manifest.totalBytes).toBeGreaterThan(0);
    await expect(readFile(join(snapshot.root, ".env"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await snapshot.cleanup();
    roots.pop();
  });
});
