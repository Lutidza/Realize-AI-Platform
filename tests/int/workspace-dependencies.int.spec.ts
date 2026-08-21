// @vitest-environment node

/**
 * @file tests/int/workspace-dependencies.int.spec.ts
 * @owner tests/int
 * @purpose Verifies real-directory dependency materialization and bounded cleanup.
 */

import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  materializeWorkspaceDependencies,
  withWorkspaceDependencies,
} from "../../services/ai-execution-worker/src/workspaceDependencies";

const temporaryRoots: string[] = [];

const fixture = async (): Promise<{
  repository: string;
  workspace: string;
}> => {
  const root = await mkdtemp(join(tmpdir(), "realize-workspace-deps-"));
  temporaryRoots.push(root);
  const repository = join(root, "repository");
  const workspace = join(root, "workspace");
  await mkdir(join(repository, "node_modules", "fixture", "bin"), {
    recursive: true,
  });
  await mkdir(join(repository, "packages", "workspace-package"), {
    recursive: true,
  });
  await mkdir(join(workspace, "packages", "workspace-package"), {
    recursive: true,
  });
  await writeFile(
    join(repository, "node_modules", "fixture", "index.js"),
    "export const fixture = true;\n",
  );
  await symlink(
    "../../packages/workspace-package",
    join(repository, "node_modules", "fixture", "workspace-package"),
  );
  await writeFile(
    join(workspace, "packages", "workspace-package", "package.json"),
    '{"name":"workspace-package"}\n',
  );
  return { repository, workspace };
};

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { force: true, recursive: true });
  }
});

describe("workspace dependency materialization", () => {
  it("creates a real node_modules tree while preserving relative links", async () => {
    const { repository, workspace } = await fixture();

    await materializeWorkspaceDependencies(repository, workspace);

    const target = join(workspace, "node_modules");
    const stats = await lstat(target);
    expect(stats.isDirectory()).toBe(true);
    expect(stats.isSymbolicLink()).toBe(false);
    await expect(
      readFile(join(target, "fixture", "index.js"), "utf8"),
    ).resolves.toBe("export const fixture = true;\n");
    expect(
      (
        await lstat(join(target, "fixture", "workspace-package"))
      ).isSymbolicLink(),
    ).toBe(true);
    await expect(
      readFile(
        join(target, "fixture", "workspace-package", "package.json"),
        "utf8",
      ),
    ).resolves.toBe('{"name":"workspace-package"}\n');
  });

  it("removes materialized dependencies after a failed bounded operation", async () => {
    const { repository, workspace } = await fixture();
    const expected = new Error("check failed");

    await expect(
      withWorkspaceDependencies(repository, workspace, async () => {
        expect(
          (await lstat(join(workspace, "node_modules"))).isDirectory(),
        ).toBe(true);
        throw expected;
      }),
    ).rejects.toBe(expected);
    await expect(lstat(join(workspace, "node_modules"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
