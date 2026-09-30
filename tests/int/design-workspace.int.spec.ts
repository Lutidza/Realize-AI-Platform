/**
 * @file tests/int/design-workspace.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет isolation, exact bytes, конкурентную публикацию и восстановление после SIGKILL.
 * @see documentation/specifications/design-workshop.md
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { once } from "node:events";
import {
  chmod,
  lstat,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ContractValidationError,
  designWorkspaceReceiptSchema,
} from "@realize/ai-contracts";
import {
  hashCanonicalJSON,
  prepareDesignWorkspace,
} from "@realize/change-engine";
import { DesignWorkspace } from "../../services/ai-execution-worker/src/design-workshop/DesignWorkspace.service";
import type { DesignWorkspacePhase } from "../../services/ai-execution-worker/src/design-workshop/DesignWorkspace.types";
import { designWorkspaceFixture } from "./designWorkspace.fixture";

describe("Design workspace immutable filesystem projection", () => {
  let fixture: string, repositoryRoot: string, storageRoot: string;
  const service = () => new DesignWorkspace({ repositoryRoot, storageRoot });
  beforeEach(async () => {
    fixture = await mkdtemp(join(tmpdir(), "realize-design-workspace-"));
    repositoryRoot = join(fixture, "checkout");
    storageRoot = join(fixture, "storage");
    await mkdir(repositoryRoot, { mode: 0o700 });
    await writeFile(
      join(repositoryRoot, "sentinel.txt"),
      "Основной checkout не меняется",
    );
  });
  afterEach(async () => {
    // Только собственный fixture: chmod не следует по symlink к внешним файлам.
    const writable = async (path: string): Promise<void> => {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) return;
      await chmod(path, 0o700);
      for (const entry of await readdir(path))
        await writable(join(path, entry));
    };
    await writable(fixture);
    await rm(fixture, { recursive: true, force: true });
  });

  it("keeps exact UTF-8 files, private paths and a stable receipt across instances", async () => {
    const source = designWorkspaceFixture();
    const expected = prepareDesignWorkspace(source);
    const receipt = await service().materialize(source);
    expect(receipt).toEqual(expected.receipt);
    expect(
      designWorkspaceReceiptSchema.safeParse({
        ...receipt,
        directory: storageRoot,
      }).success,
    ).toBe(false);
    const result = await service().resolve(receipt);
    expect(result.manifest).toEqual(expected.manifest);
    for (const file of source.snapshot.files)
      expect(await service().readFile(receipt, file.path)).toEqual(file);
    expect((await stat(result.directory)).mode & 0o777).toBe(0o500);
    expect(
      (await stat(join(result.directory, source.snapshot.files[0].path))).mode &
        0o777,
    ).toBe(0o400);
    expect(await service().materialize(source)).toEqual(receipt);
    expect(await readFile(join(repositoryRoot, "sentinel.txt"), "utf8")).toBe(
      "Основной checkout не меняется",
    );
    expect(await readdir(repositoryRoot)).toEqual(["sentinel.txt"]);
  });

  it("normalizes file order but refuses forged hash, extra fields and unsafe paths before I/O", async () => {
    const source = designWorkspaceFixture();
    expect(
      prepareDesignWorkspace({
        ...source,
        snapshot: {
          ...source.snapshot,
          files: [...source.snapshot.files].reverse(),
        },
      }).receipt,
    ).toEqual(prepareDesignWorkspace(source).receipt);
    for (const value of [
      { ...source, actorId: "client" },
      { ...source, pin: { ...source.pin, directory: repositoryRoot } },
      {
        ...source,
        snapshot: {
          ...source.snapshot,
          files: [{ path: "src/../../escape.ts", content: "bad" }],
        },
      },
      {
        ...source,
        snapshot: {
          ...source.snapshot,
          files: [{ path: "src/a.ts", content: "changed" }],
        },
      },
    ])
      await expect(service().materialize(value)).rejects.toBeInstanceOf(
        ContractValidationError,
      );
    await expect(lstat(storageRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("publishes an empty snapshot and never exposes a partial revision", async () => {
    const source = designWorkspaceFixture();
    source.snapshot.files = [];
    source.pin.revision.contentHash = hashCanonicalJSON(source.snapshot);
    const receipt = await service().materialize(source);
    const resolved = await service().resolve(receipt);
    expect(await readdir(resolved.directory)).toEqual([
      ".realize-manifest.json",
    ]);
    expect(receipt.fileCount).toBe(0);
  });

  it.each([8, 24])(
    "converges %i concurrent publications without an extra model or mutable head",
    async (count) => {
      const source = designWorkspaceFixture();
      const results = await Promise.allSettled(
        Array.from({ length: count }, () => service().materialize(source)),
      );
      expect(results.map((result) => result.status)).toEqual(
        Array(count).fill("fulfilled"),
      );
      const receipts = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      expect(
        receipts.every(
          (receipt) => JSON.stringify(receipt) === JSON.stringify(receipts[0]),
        ),
      ).toBe(true);
      expect(
        await readdir(
          join(storageRoot, "bindings", source.pin.bindingId, "revisions"),
        ),
      ).toEqual([source.pin.revision.revisionId]);
      await service().resolve(receipts[0]);
      expect(
        await readdir(
          join(storageRoot, "bindings", source.pin.bindingId, "transactions"),
        ),
      ).toEqual([]);
    },
  );

  it("recovers one prepared attempt concurrently while its original caller resumes", async () => {
    const source = designWorkspaceFixture();
    const prepared = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const original = new DesignWorkspace({
      repositoryRoot,
      storageRoot,
      onCheckpoint: async ({ phase }) => {
        if (phase === "prepared") {
          prepared.resolve();
          await resume.promise;
        }
      },
    }).materialize(source);
    // Ранний отказ исходного вызова не оставляет ожидание checkpoint навсегда.
    const first = Promise.allSettled([original]);
    let recovered: Awaited<ReturnType<typeof Promise.allSettled>> = [];
    try {
      await Promise.race([prepared.promise, original]);
      recovered = await Promise.allSettled(
        Array.from({ length: 24 }, () => service().materialize(source)),
      );
    } finally {
      resume.resolve();
      await first;
    }
    expect(
      [...recovered, ...(await first)].map((result) => result.status),
    ).toEqual(Array(25).fill("fulfilled"));
    await service().resolve(prepareDesignWorkspace(source).receipt);
    expect(
      await readdir(
        join(storageRoot, "bindings", source.pin.bindingId, "transactions"),
      ),
    ).toEqual([]);
  });

  it("keeps older revisions and handles file deletion by publishing a separate tree", async () => {
    const source = designWorkspaceFixture();
    const first = await service().materialize(source);
    const next = structuredClone(source);
    next.pin.revision = {
      revisionId: randomUUID(),
      number: 2,
      contentHash: "",
    };
    next.snapshot.files = [
      { path: "src/new.ts", content: "export const updated = true;" },
    ];
    next.pin.revision.contentHash = hashCanonicalJSON(next.snapshot);
    const second = await service().materialize(next);
    await expect(
      service().readFile(second, source.snapshot.files[0].path),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      await service().readFile(first, source.snapshot.files[0].path),
    ).toEqual(source.snapshot.files[0]);
  });

  it("rejects another project and a different source under the same identity", async () => {
    const source = designWorkspaceFixture();
    const receipt = await service().materialize(source);
    const wrong = structuredClone(source);
    wrong.snapshot.files[0].content = "different";
    wrong.pin.revision.contentHash = hashCanonicalJSON(wrong.snapshot);
    await expect(service().materialize(wrong)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      service().materialize({
        ...source,
        pin: { ...source.pin, projectId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await service().readFile(receipt, source.snapshot.files[0].path),
    ).toEqual(source.snapshot.files[0]);
  });

  it("refuses storage in the checkout, its ancestor, and a symlink into the checkout", async () => {
    const source = designWorkspaceFixture();
    const alias = join(fixture, "alias");
    await symlink(repositoryRoot, alias);
    for (const root of [
      repositoryRoot,
      join(repositoryRoot, "generated"),
      fixture,
      alias,
      join(alias, "generated"),
      "relative",
    ])
      await expect(
        new DesignWorkspace({ repositoryRoot, storageRoot: root }).materialize(
          source,
        ),
      ).rejects.toMatchObject({ code: "INVALID_ROOT" });
    expect(await readdir(repositoryRoot)).toEqual(["sentinel.txt"]);
  });

  it("does not create directories for a read or an already cancelled request", async () => {
    const source = designWorkspaceFixture();
    const receipt = prepareDesignWorkspace(source).receipt;
    await expect(service().resolve(receipt)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      service().materialize(source, AbortSignal.abort()),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    await expect(lstat(storageRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["symlink", "hardlink", "corruption", "extra", "directory"])(
    "rejects %s tampering instead of trusting a stored receipt",
    async (kind) => {
      const source = designWorkspaceFixture();
      const receipt = await service().materialize(source);
      const { directory } = await service().resolve(receipt);
      const target = join(directory, source.snapshot.files[0].path);
      await chmod(directory, 0o700);
      await chmod(dirname(target), 0o700);
      if (kind === "symlink") {
        await unlink(target);
        await symlink(join(repositoryRoot, "sentinel.txt"), target);
      }
      if (kind === "hardlink") {
        await unlink(target);
        await link(join(repositoryRoot, "sentinel.txt"), target);
      }
      if (kind === "corruption") {
        await chmod(target, 0o600);
        await writeFile(target, "modified");
      }
      if (kind === "extra")
        await writeFile(join(directory, "unlisted.txt"), "unexpected");
      if (kind === "directory")
        await mkdir(join(directory, "unlisted"), { mode: 0o700 });
      await expect(service().materialize(source)).rejects.toMatchObject({
        code: "INTEGRITY",
      });
      await expect(
        service().readFile(receipt, source.snapshot.files[0].path),
      ).rejects.toMatchObject({ code: "INTEGRITY" });
    },
  );

  it("refuses traversal and secret reads even after successful publication", async () => {
    const receipt = await service().materialize(designWorkspaceFixture());
    for (const path of [
      "../sentinel.txt",
      "/etc/passwd",
      ".env",
      "src/../.realize-manifest.json",
    ])
      await expect(service().readFile(receipt, path)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
  });

  it("refuses a corrupted durable receipt and another revision number", async () => {
    const source = designWorkspaceFixture();
    const receipt = await service().materialize(source);
    await expect(
      service().materialize({
        ...source,
        pin: { ...source.pin, revision: { ...source.pin.revision, number: 2 } },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const path = join(
      storageRoot,
      "bindings",
      source.pin.bindingId,
      "receipts",
      `${receipt.revision.revisionId}.json`,
    );
    await writeFile(
      path,
      JSON.stringify({ ...receipt, manifestHash: "0".repeat(64) }),
    );
    await expect(service().resolve(receipt)).rejects.toMatchObject({
      code: "INTEGRITY",
    });
    await expect(service().materialize(source)).rejects.toMatchObject({
      code: "INTEGRITY",
    });
  });

  it("refuses a symlink replacing an existing binding and does not read through it", async () => {
    const source = designWorkspaceFixture();
    const receipt = await service().materialize(source);
    const path = join(storageRoot, "bindings", source.pin.bindingId);
    const { rename } = await import("node:fs/promises");
    await rename(path, join(storageRoot, "preserved-binding"));
    await symlink(repositoryRoot, path);
    await expect(service().resolve(receipt)).rejects.toMatchObject({
      code: "INTEGRITY",
    });
    await expect(service().materialize(source)).rejects.toMatchObject({
      code: "INTEGRITY",
    });
    expect(await readdir(repositoryRoot)).toEqual(["sentinel.txt"]);
  });

  for (const stopAt of [
    "staging",
    "prepared",
    "published",
    "committed",
  ] satisfies DesignWorkspacePhase[]) {
    it(`recovers after SIGKILL at ${stopAt} with the same exact receipt`, async () => {
      const source = designWorkspaceFixture(),
        expected = prepareDesignWorkspace(source).receipt;
      const input = join(fixture, "input.json");
      await writeFile(
        input,
        JSON.stringify({ repositoryRoot, storageRoot, source, stopAt }),
        { mode: 0o600 },
      );
      const child = fork(
        resolve("tests/int/designWorkspaceChild.fixture.ts"),
        [input],
        {
          execArgv: ["--import=tsx/esm"],
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        },
      );
      try {
        const message = await Promise.race([
          once(child, "message").then(([value]) => value),
          once(child, "exit").then(() => {
            throw Error("Child exited before checkpoint");
          }),
          new Promise((_, reject) => {
            const timer = setTimeout(
              () => reject(Error("Checkpoint timeout")),
              15000,
            );
            timer.unref();
          }),
        ]);
        expect(message).toEqual({ phase: stopAt });
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
        if (stopAt === "staging" || stopAt === "prepared")
          await expect(service().resolve(expected)).rejects.toMatchObject({
            code: "NOT_FOUND",
          });
        const revisionDirectory = join(
          storageRoot,
          "bindings",
          source.pin.bindingId,
          "revisions",
          source.pin.revision.revisionId,
        );
        const attemptRoot = join(
          storageRoot,
          "bindings",
          source.pin.bindingId,
          "transactions",
        );
        const originalDirectory =
          stopAt === "prepared"
            ? join(attemptRoot, (await readdir(attemptRoot))[0], "workspace")
            : revisionDirectory;
        const before =
          stopAt === "staging" ? undefined : await stat(originalDirectory);
        expect(await service().materialize(source)).toEqual(expected);
        if (before)
          expect((await stat(revisionDirectory)).ino).toBe(before.ino);
        expect(
          await service().readFile(expected, source.snapshot.files[0].path),
        ).toEqual(source.snapshot.files[0]);
        expect(await readdir(repositoryRoot)).toEqual(["sentinel.txt"]);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
        }
      }
    }, 25000);
  }
});
