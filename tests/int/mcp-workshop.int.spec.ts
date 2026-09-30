/**
 * @file tests/int/mcp-workshop.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-26
 * @description Проверяет GPT→Workshop CAS/replay, отзыв grants, реальные снимки и ограниченный MCP wire.
 * @see documentation/specifications/design-workshop.md
 */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLocalReq } from "payload";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { normalizeDesignSnapshot } from "@realize/change-engine";
import { Client } from "@modelcontextprotocol/client";
import {
  designMutationReceiptSchema,
  designPreviewJobSchema,
  mcpWorkshopOutputs,
  MCP_WORKSHOP_POLICY,
  type DesignMutationReceiptDto,
} from "@realize/ai-contracts";
import { DesignWorkshop } from "../../packages/payload-ai-plugin/src/design-workshop/DesignWorkshop.service";
import { readDesignPreviewSource } from "@realize/payload-ai-control/server/workshop";
import {
  openWorkshopMcpFixture,
  workshopFixtureGrants,
} from "./mcpWorkshop.fixture";
import { designPreviewFixture } from "./designPreview.fixture";
import { up, down } from "../../src/migrations/20260926_112722_workshop_mcp";

describe.skipIf(!process.env.WORKSHOP_MCP_TEST_DATABASE_URI)(
  "managed Workshop MCP",
  () => {
    let fixture: Awaited<ReturnType<typeof openWorkshopMcpFixture>>;
    let client: Client;
    let project: DesignMutationReceiptDto;
    const call = (name: string, input: Record<string, unknown>) =>
      client.callTool({ name, arguments: input });
    const ok = (result: Awaited<ReturnType<typeof call>>) => {
      expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(
        true,
      );
      expect(result.structuredContent).toMatchObject({ ok: true });
      return (result.structuredContent as { data: unknown }).data;
    };
    beforeAll(async () => {
      fixture = await openWorkshopMcpFixture();
      client = await fixture.connect();
    }, 60000);
    afterAll(async () => {
      await fixture?.close();
    }, 20000);

    it("native empty down/up preserves the schema and populated rollback is guarded", async () => {
      const req = await createLocalReq({}, fixture.payload),
        adapter = fixture.payload.db as unknown as PostgresAdapter;
      const id = await adapter.beginTransaction();
      expect(id).toBeTruthy();
      req.transactionID = id!;
      const db = adapter.sessions[String(id)].db;
      try {
        await down({ db, payload: fixture.payload, req });
        await up({ db, payload: fixture.payload, req });
        await adapter.commitTransaction(id!);
      } catch (error) {
        await adapter.rollbackTransaction(id!);
        throw error;
      }
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM payload_migrations",
          )
        ).rows[0].count,
      ).toBe(25);
    });

    it.each(["modern", "legacy"] as const)(
      "advertises correct effects and schemas in %s protocol",
      async (era) => {
        const sdk = await fixture.connect(undefined, era),
          catalog = await sdk.listTools();
        expect(Buffer.byteLength(JSON.stringify(catalog))).toBeLessThan(131072);
        for (const [name, policy] of Object.entries(MCP_WORKSHOP_POLICY)) {
          expect(
            catalog.tools.find((tool) => tool.name === name),
          ).toMatchObject({
            annotations: {
              readOnlyHint: policy.effect === "read",
              destructiveHint: policy.destructive,
              idempotentHint: true,
              openWorldHint: false,
            },
          });
        }
        const result = await sdk.callTool({
          name: "ai_capabilities_list",
          arguments: {},
        });
        expect(ok(result)).toMatchObject({
          catalogVersion: "1.2",
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "workshop_change_apply",
              effect: "write",
              availability: "not_probed",
            }),
          ]),
        });
      },
    );

    it("shares saved projects with Admin, replays creation and accepts a bounded request over 64 KiB", async () => {
      const input = { ...designPreviewFixture(), idempotencyKey: randomUUID() };
      input.snapshot.sources.push({
        kind: "note",
        title: "Большой материал",
        text: "🧩".repeat(2000),
      });
      input.snapshot.files.push({
        path: "src/context.md",
        content: "Русский контекст 🧩\n".repeat(2500),
      });
      project = designMutationReceiptSchema.parse(
        ok(await call("workshop_project_create", input)),
      );
      expect(ok(await call("workshop_project_create", input))).toEqual(project);
      const req = await createLocalReq(
        { user: fixture.actor },
        fixture.payload,
      );
      const admin = new DesignWorkshop(req, {
        userCollection: "users",
        access: { canManageDesignWorkshop: () => true },
      });
      expect(
        (await admin.revision(project.projectId, project.revision.revisionId))
          .snapshot,
      ).toEqual(normalizeDesignSnapshot(input.snapshot));
      const records = await fixture.payload.find({
        collection: "realize-design-revisions",
        where: { revisionId: { equals: project.revision.revisionId } },
        overrideAccess: true,
      });
      expect(records.docs[0].channel).toBe("mcp");
      expect(
        (await admin.list({})).items.filter(
          (item) => item.projectId === project.projectId,
        ),
      ).toHaveLength(1);
      const metadata = mcpWorkshopOutputs.workshop_project_get.parse(
        ok(
          await call("workshop_project_get", { projectId: project.projectId }),
        ),
      );
      expect(metadata.revision).toEqual(project.revision);
      expect(metadata.files[0]).toMatchObject({
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        bytes: expect.any(Number),
      });
      expect(JSON.stringify(metadata)).not.toMatch(
        /requestedBy|author|leaseToken|password|mcpAuthorization/,
      );
    });

    it("pins changes to the base and exact candidate, including replay after the head advanced", async () => {
      const command = {
        projectId: project.projectId,
        baseRevisionId: project.revision.revisionId,
        summary: "Уточнить заголовок",
        operations: [
          {
            kind: "put",
            path: "src/Label.tsx",
            content:
              "export default function Label(){return <h1>Правка из GPT</h1>}",
          },
        ],
        idempotencyKey: randomUUID(),
      };
      const prepared = designMutationReceiptSchema.parse(
        ok(await call("workshop_change_prepare", command)),
      );
      expect(ok(await call("workshop_change_prepare", command))).toEqual(
        prepared,
      );
      const change = mcpWorkshopOutputs.workshop_change_get.parse(
        ok(
          await call("workshop_change_get", {
            projectId: project.projectId,
            changeId: prepared.changeId,
          }),
        ),
      );
      expect(change.files).toEqual([
        expect.objectContaining({ path: "src/Label.tsx", kind: "added" }),
      ]);
      const apply = {
        projectId: project.projectId,
        changeId: prepared.changeId,
        candidateHash: change.candidateHash,
        idempotencyKey: randomUUID(),
      };
      expect(
        (
          await call("workshop_change_apply", {
            ...apply,
            candidateHash: "0".repeat(64),
          })
        ).structuredContent,
      ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      const saved = designMutationReceiptSchema.parse(
        ok(await call("workshop_change_apply", apply)),
      );
      expect(saved.revision.number).toBe(2);
      expect(ok(await call("workshop_change_apply", apply))).toEqual(saved);
      expect(
        (
          await call("workshop_change_prepare", {
            ...command,
            idempotencyKey: randomUUID(),
          })
        ).structuredContent,
      ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      expect(
        ok(
          await call("workshop_project_create", {
            ...designPreviewFixture(),
            title: "Другой проект",
            idempotencyKey: randomUUID(),
          }),
        ),
      ).toMatchObject({ action: "create" });
    });

    it("bounds Unicode reads and project pages within the smallest response budget", async () => {
      await fixture.configure({
        limits: {
          callsPerMinute: 60,
          burst: 10,
          concurrentCalls: 4,
          responseBytes: 8192,
        },
      });
      try {
        const read = await call("workshop_snapshot_read", {
          projectId: project.projectId,
          revisionId: project.revision.revisionId,
          section: "file",
          path: "src/context.md",
          limit: 4096,
        });
        const first = mcpWorkshopOutputs.workshop_snapshot_read.parse(ok(read));
        expect(
          Buffer.byteLength(JSON.stringify(read)) + 1024,
        ).toBeLessThanOrEqual(8192);
        expect(first.text.isWellFormed()).toBe(true);
        const next = mcpWorkshopOutputs.workshop_snapshot_read.parse(
          ok(
            await call("workshop_snapshot_read", {
              projectId: project.projectId,
              revisionId: project.revision.revisionId,
              section: "file",
              path: "src/context.md",
              offset: first.nextOffset,
              limit: 4096,
            }),
          ),
        );
        expect(first.text + next.text).toBe(
          Array.from("Русский контекст 🧩\n".repeat(2500))
            .slice(0, next.nextOffset!)
            .join(""),
        );
        const list = mcpWorkshopOutputs.workshop_projects_list.parse(
          ok(await call("workshop_projects_list", { limit: 1 })),
        );
        expect(list.items).toHaveLength(1);
        expect(list.hasNextPage).toBe(true);
      } finally {
        await fixture.configure({
          limits: {
            callsPerMinute: 60,
            burst: 10,
            concurrentCalls: 4,
            responseBytes: 131072,
          },
        });
      }
    });

    it("rejects foreign owners, ungranted writes, forged identity and unknown command fields", async () => {
      const readOnly = await fixture.issue({
        ...workshopFixtureGrants,
        workshopWrite: false,
        workshopPreview: false,
      });
      const reader = await fixture.connect(readOnly.token);
      expect(
        (await reader.listTools()).tools
          .filter((tool) => tool.name.startsWith("workshop_"))
          .map((tool) => tool.name)
          .sort(),
      ).toEqual(
        [
          "workshop_projects_list",
          "workshop_project_get",
          "workshop_snapshot_read",
          "workshop_change_get",
        ].sort(),
      );
      await expect(
        fixture.direct(readOnly, "workshop_project_create", {
          ...designPreviewFixture(),
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 403 });
      const foreign = await fixture.issue(workshopFixtureGrants, fixture.other);
      await expect(
        fixture.direct(foreign, "workshop_project_get", {
          projectId: project.projectId,
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        fixture.direct(
          { ...fixture.access, actorId: String(fixture.other.id) },
          "workshop_project_get",
          { projectId: project.projectId },
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (
          await call("workshop_project_get", {
            projectId: project.projectId,
            actor: fixture.other.id,
          })
        ).isError,
      ).toBe(true);
      fixture.profiles(false);
      try {
        await expect(
          fixture.direct(fixture.access, "workshop_projects_list", {}),
        ).rejects.toMatchObject({ status: 403 });
      } finally {
        fixture.profiles();
      }
    });

    it("does not expose issued grants until apply and blocks a stale session after revoke", async () => {
      const pending = await fixture.issue(
        workshopFixtureGrants,
        fixture.actor,
        false,
      );
      await expect(
        fixture.direct(pending, "workshop_projects_list", {}),
      ).rejects.toMatchObject({ status: 403 });
      await fixture.configure({});
      const sdk = await fixture.connect(pending.token);
      await sdk.listTools();
      await fixture.revoke(pending.identity.clientID);
      await expect(
        sdk.callTool({ name: "workshop_projects_list", arguments: {} }),
      ).rejects.toBeDefined();
      await expect(
        fixture.direct(pending, "workshop_projects_list", {}),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("enqueues and captures one immutable version, returns a real image fitting an 8 KiB MCP response", async () => {
      await fixture.presence();
      const input = {
        projectId: project.projectId,
        revisionId: project.revision.revisionId,
        entryPath: "src/Preview.tsx",
        idempotencyKey: randomUUID(),
      };
      const job = designPreviewJobSchema.parse(
        ok(await call("workshop_preview_start", input)),
      );
      expect(ok(await call("workshop_preview_start", input))).toEqual(job);
      const claim = await fixture.queue.claimNext(fixture.instanceKey);
      expect(claim?.mcpAuthorization).toEqual(fixture.access.identity);
      await fixture.executor.execute(claim!);
      const completed = designPreviewJobSchema.parse(
        ok(
          await call("workshop_preview_get", {
            projectId: project.projectId,
            jobId: job.jobId,
          }),
        ),
      );
      expect(completed.state).toBe("completed");
      expect(completed.source.revision.number).toBe(1);
      await fixture.configure({
        limits: {
          callsPerMinute: 60,
          burst: 10,
          concurrentCalls: 4,
          responseBytes: 8192,
        },
      });
      try {
        const image = await call("workshop_preview_image", {
          projectId: project.projectId,
          jobId: job.jobId,
          width: 390,
        });
        const metadata = mcpWorkshopOutputs.workshop_preview_image.parse(
          ok(image),
        );
        expect(metadata.source).toEqual(job.source);
        expect(metadata.sourceSha256).toBe(
          completed.evidence?.images.find((value) => value.width === 390)
            ?.sha256,
        );
        const part = image.content.find((item) => item.type === "image");
        expect(part?.type).toBe("image");
        if (part?.type === "image")
          expect(Buffer.from(part.data, "base64").readUInt16BE()).toBe(0xffd8);
        expect(
          Buffer.byteLength(JSON.stringify(image)) + 1024,
        ).toBeLessThanOrEqual(8192);
      } finally {
        await fixture.configure({
          limits: {
            callsPerMinute: 60,
            burst: 10,
            concurrentCalls: 4,
            responseBytes: 131072,
          },
        });
      }
    }, 60000);

    it("revokes queued execution and cancels idempotently without publishing a stale result", async () => {
      const access = await fixture.issue();
      await fixture.presence();
      const input = {
        projectId: project.projectId,
        revisionId: project.revision.revisionId,
        entryPath: "src/Preview.tsx",
        idempotencyKey: randomUUID(),
      };
      const job = designPreviewJobSchema.parse(
        await fixture.direct(access, "workshop_preview_start", input),
      );
      await fixture.revoke(access.identity.clientID);
      const claim = await fixture.queue.claimNext(fixture.instanceKey);
      expect(claim?.jobId).toBe(job.jobId);
      await fixture.executor.execute(claim!);
      expect(
        ok(
          await call("workshop_preview_get", {
            projectId: project.projectId,
            jobId: job.jobId,
          }),
        ),
      ).toMatchObject({
        state: "failed",
        error: "AUTH_REVOKED",
        evidence: null,
      });
      await expect(
        readDesignPreviewSource(
          fixture.payload,
          String(fixture.actor.id),
          project.projectId,
          project.revision.revisionId,
          access.identity,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await fixture.presence();
      const another = designPreviewJobSchema.parse(
        ok(
          await call("workshop_preview_start", {
            ...input,
            idempotencyKey: randomUUID(),
          }),
        ),
      );
      const args = { projectId: project.projectId, jobId: another.jobId };
      expect(ok(await call("workshop_preview_cancel", args))).toMatchObject({
        state: "cancelled",
      });
      expect(ok(await call("workshop_preview_cancel", args))).toMatchObject({
        state: "cancelled",
      });
    });

    it("stops a running capture when its MCP credential is rotated", async () => {
      const access = await fixture.issue();
      const input = designPreviewFixture();
      input.snapshot.files[0].content =
        "export default function App(){while(true){}return null}";
      const created = designMutationReceiptSchema.parse(
        await fixture.direct(access, "workshop_project_create", {
          ...input,
          idempotencyKey: randomUUID(),
        }),
      );
      await fixture.presence();
      const job = designPreviewJobSchema.parse(
        await fixture.direct(access, "workshop_preview_start", {
          projectId: created.projectId,
          revisionId: created.revision.revisionId,
          entryPath: "src/Preview.tsx",
          idempotencyKey: randomUUID(),
        }),
      );
      const claim = await fixture.queue.claimNext(fixture.instanceKey);
      expect(claim?.jobId).toBe(job.jobId);
      const unit = fixture.staging.unit(claim!.jobId, claim!.leaseToken);
      const work = fixture.executor.execute(claim!);
      try {
        await expect
          .poll(
            async () =>
              (
                await promisify(execFile)("systemctl", [
                  "--user",
                  "show",
                  unit,
                  "--property=ActiveState",
                  "--value",
                ])
              ).stdout.trim(),
            { timeout: 10000 },
          )
          .toBe("active");
        await fixture.rotate(access.identity.clientID);
        await work;
        expect(
          ok(
            await call("workshop_preview_get", {
              projectId: created.projectId,
              jobId: job.jobId,
            }),
          ),
        ).toMatchObject({
          state: "failed",
          error: "AUTH_REVOKED",
          evidence: null,
        });
        const state = (
          await promisify(execFile)("systemctl", [
            "--user",
            "show",
            unit,
            "--property=ActiveState",
            "--value",
          ])
        ).stdout.trim();
        expect(["inactive", "failed"]).toContain(state);
      } finally {
        await fixture.sandbox.stop(unit);
        await work;
      }
    }, 30000);

    it("checks fresh user permissions and rejects an aborted mutation before any write", async () => {
      await fixture.payload.update({
        collection: "users",
        id: fixture.actor.id,
        data: { roles: ["customer"] },
        overrideAccess: true,
      });
      try {
        expect(
          (await call("workshop_projects_list", {})).structuredContent,
        ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      } finally {
        await fixture.payload.update({
          collection: "users",
          id: fixture.actor.id,
          data: { roles: ["admin"] },
          overrideAccess: true,
        });
      }
      const before = (
        await fixture.pool.query(
          "SELECT count(*)::int AS count FROM realize_design_projects",
        )
      ).rows[0].count;
      await expect(
        fixture.direct(
          fixture.access,
          "workshop_project_create",
          { ...designPreviewFixture(), idempotencyKey: randomUUID() },
          131072,
          AbortSignal.abort(),
        ),
      ).rejects.toMatchObject({ status: 503 });
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM realize_design_projects",
          )
        ).rows[0].count,
      ).toBe(before);
    });

    it("blocks populated native rollback while retaining projects and authorization records", async () => {
      const req = await createLocalReq({}, fixture.payload),
        adapter = fixture.payload.db as unknown as PostgresAdapter;
      const before = (
        await fixture.pool.query(
          "SELECT count(*)::int AS count FROM realize_design_revisions",
        )
      ).rows[0].count;
      const id = await adapter.beginTransaction();
      req.transactionID = id!;
      try {
        let failure: unknown;
        try {
          await down({
            db: adapter.sessions[String(id)].db,
            payload: fixture.payload,
            req,
          });
        } catch (error) {
          failure = error;
        }
        const messages: string[] = [];
        for (let cause = failure; cause instanceof Error; cause = cause.cause)
          messages.push(cause.message);
        expect(messages.join("\n")).toContain("WORKSHOP_MCP_ROLLBACK_BLOCKED");
      } finally {
        await adapter.rollbackTransaction(id!);
      }
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM realize_design_revisions",
          )
        ).rows[0].count,
      ).toBe(before);
    });
  },
);
