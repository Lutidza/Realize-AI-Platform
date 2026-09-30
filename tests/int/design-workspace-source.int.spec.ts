/**
 * @file tests/int/design-workspace-source.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет передачу authenticated DB revision в файловую проекцию и запреты доступа.
 * @see documentation/specifications/design-workshop.md
 */
// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalReq, type Payload, type PayloadRequest } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";
import { DesignWorkspace } from "../../services/ai-execution-worker/src/design-workshop/DesignWorkspace.service";
import { DesignWorkshop } from "../../packages/payload-ai-plugin/src/design-workshop/DesignWorkshop.service";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";
import { designProjectFixture } from "./designWorkshop.fixture";

describe.skipIf(!process.env.WORKSHOP_WORKSPACE_DATABASE_URI)(
  "Authenticated source → immutable workspace",
  () => {
    let payload: Payload;
    let owner: NonNullable<PayloadRequest["user"]>,
      other: NonNullable<PayloadRequest["user"]>;
    let fixture: string, repositoryRoot: string, storageRoot: string;
    let permitted = true;
    const options = sanitizeOptions({
      enabled: false,
      access: {
        canManageDesignWorkshop: () => permitted,
        canApproveRelease: () => false,
        canManageAIConfiguration: () => false,
        canManageData: () => false,
        canManageIntegrations: () => false,
        canUseChat: () => false,
        canViewRuns: () => false,
      },
      runtime: {
        mode: "local-development",
        isolated: true,
        controlPlaneTokenEnv: "WORKSPACE_UNUSED_TOKEN",
      },
    });
    const workshop = async (
      actor: PayloadRequest["user"] = owner,
      custom = options,
    ) => {
      const req = await createLocalReq({ user: actor ?? undefined }, payload);
      req.headers.set("idempotency-key", randomUUID());
      return new DesignWorkshop(req, custom);
    };
    beforeAll(async () => {
      const url = new URL(process.env.WORKSHOP_WORKSPACE_DATABASE_URI!);
      if (
        url.hostname !== "127.0.0.1" ||
        url.port !== "40261" ||
        !/^realize_workshop_fixture_workspace[a-z0-9]*$/.test(
          url.pathname.slice(1),
        ) ||
        process.env.DATABASE_URI !== url.href
      )
        throw Error("ISOLATED_WORKSPACE_DATABASE_REQUIRED");
      payload = await openMcpPayload();
      const createUser = async () => ({
        ...(await payload.create({
          collection: "users",
          overrideAccess: true,
          data: {
            email: `workspace-${randomUUID()}@example.invalid`,
            password: randomBytes(24).toString("base64url"),
            name: "Workspace fixture",
            roles: ["admin"],
          },
        })),
        collection: "users" as const,
      });
      owner = await createUser();
      other = await createUser();
      fixture = await mkdtemp(join(tmpdir(), "realize-workspace-source-"));
      repositoryRoot = join(fixture, "checkout");
      storageRoot = join(fixture, "storage");
      await mkdir(repositoryRoot, { mode: 0o700 });
    }, 30000);
    afterAll(async () => {
      await payload?.destroy();
      if (fixture) {
        const writable = async (path: string): Promise<void> => {
          const info = await lstat(path);
          if (!info.isDirectory() || info.isSymbolicLink()) return;
          await chmod(path, 0o700);
          for (const child of await readdir(path))
            await writable(join(path, child));
        };
        await writable(fixture);
        await rm(fixture, { recursive: true, force: true });
      }
    });

    it("does not create filesystem state for anonymous, other owner, revoked or absent permission", async () => {
      const project = await (await workshop()).create(designProjectFixture());
      const workspace = new DesignWorkspace({ repositoryRoot, storageRoot });
      const materialize = async (
        actor: PayloadRequest["user"],
        custom = options,
      ) =>
        workspace.materialize(
          await (
            await workshop(actor, custom)
          ).workspaceSource(project.projectId, project.revision.revisionId),
        );
      await expect(materialize(null)).rejects.toMatchObject({ status: 401 });
      await expect(materialize(other)).rejects.toMatchObject({ status: 404 });
      permitted = false;
      try {
        await expect(materialize(owner)).rejects.toMatchObject({ status: 403 });
      } finally {
        permitted = true;
      }
      await expect(
        materialize(owner, {
          ...options,
          access: { ...options.access, canManageDesignWorkshop: undefined },
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(lstat(storageRoot)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("pins a historical DB revision and materializes the next revision after apply without rewriting the old one", async () => {
      const input = designProjectFixture();
      const project = await (await workshop()).create(input);
      const workspace = new DesignWorkspace({ repositoryRoot, storageRoot });
      const original = await (
        await workshop()
      ).workspaceSource(project.projectId, project.revision.revisionId);
      const first = await workspace.materialize(original);
      const change = await (
        await workshop()
      ).prepare(project.projectId, {
        baseRevisionId: project.revision.revisionId,
        summary: "Уточнить отступы",
        operations: [
          {
            kind: "put",
            path: "src/task.css",
            content: "main { padding: 32px; }",
          },
        ],
      });
      const next = await (
        await workshop()
      ).apply(project.projectId, change.changeId!, {});
      const current = await (
        await workshop()
      ).workspaceSource(project.projectId, next.revision.revisionId);
      const second = await workspace.materialize(current);
      expect(second.bindingId).toBe(first.bindingId);
      expect(second.revision).toEqual(next.revision);
      expect(await workspace.readFile(first, "src/task.css")).toEqual(
        input.snapshot.files[1],
      );
      expect(await workspace.readFile(second, "src/task.css")).toEqual({
        path: "src/task.css",
        content: "main { padding: 32px; }",
      });
      expect(
        await (
          await workshop()
        ).workspaceSource(project.projectId, first.revision.revisionId),
      ).toEqual(original);
      expect(Object.keys(original).sort()).toEqual(["pin", "snapshot"]);
      expect(JSON.stringify(original)).not.toContain(owner.email);
      expect(await readdir(repositoryRoot)).toEqual([]);
    });

    it("rejects a revision from another project and corrupted persisted source", async () => {
      const first = await (await workshop()).create(designProjectFixture());
      const second = await (await workshop()).create(designProjectFixture());
      await expect(
        (await workshop()).workspaceSource(
          first.projectId,
          second.revision.revisionId,
        ),
      ).rejects.toMatchObject({ status: 404 });
      const records = await payload.find({
        collection: "realize-design-revisions",
        where: { revisionId: { equals: first.revision.revisionId } },
        overrideAccess: true,
      });
      await payload.update({
        collection: "realize-design-revisions",
        id: records.docs[0].id,
        overrideAccess: true,
        data: { contentHash: "0".repeat(64) },
      });
      await expect(
        (await workshop()).workspaceSource(
          first.projectId,
          first.revision.revisionId,
        ),
      ).rejects.toThrow("integrity");
    });
  },
);
