/**
 * @file tests/int/design-preview.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет PostgreSQL очередь, авторизацию, fencing и настоящий Linux Chromium capture.
 * @see documentation/specifications/design-workshop.md
 */
// @vitest-environment node
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { fork, execFile } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { createLocalReq, type Payload, type PayloadRequest } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DesignPreviewArtifact } from "@realize/change-engine";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";
import { readDesignPreviewSource } from "@realize/payload-ai-control/server/workshop";
import { WorkerPresenceRepository } from "@realize/payload-ai-control/server/integration-runtime";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";
import { DesignWorkshop } from "../../packages/payload-ai-plugin/src/design-workshop/DesignWorkshop.service";
import { DesignPreview } from "../../packages/payload-ai-plugin/src/design-workshop/DesignPreview.service";
import { createDesignWorkshopEndpoints } from "../../packages/payload-ai-plugin/src/design-workshop/designWorkshopEndpoints.controller";
import { readMcpActor } from "../../packages/payload-ai-plugin/src/integrations/mcp/readMcpActor.service";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../packages/payload-ai-plugin/src/constants";
import type { RealizeAIServerRuntime } from "../../packages/payload-ai-plugin/src/types";
import { DesignPreviewQueue } from "../../services/ai-execution-worker/src/design-workshop/DesignPreviewQueue.repository";
import { DesignPreviewExecutor } from "../../services/ai-execution-worker/src/design-workshop/DesignPreviewExecutor.service";
import { DesignPreviewStaging } from "../../services/ai-execution-worker/src/design-workshop/DesignPreviewStaging.repository";
import { DesignPreviewSandbox } from "../../services/ai-execution-worker/src/design-workshop/DesignPreviewSandbox.adapter";
import { readDesignPreviewToolchain } from "../../services/ai-execution-worker/src/design-workshop/designPreviewToolchain.config";
import { designPreviewStorageRoot } from "../../services/ai-execution-worker/src/design-workshop/designPreviewStorageRoot.config";
import { designPreviewFixture } from "./designPreview.fixture";

describe.skipIf(!process.env.WORKSHOP_PREVIEW_DATABASE_URI)(
  "Workshop durable sandbox preview",
  () => {
    let payload: Payload,
      queue: DesignPreviewQueue,
      staging: DesignPreviewStaging,
      sandbox: DesignPreviewSandbox,
      executor: DesignPreviewExecutor;
    let owner: NonNullable<PayloadRequest["user"]>,
      other: NonNullable<PayloadRequest["user"]>;
    let fixture: string, repositoryRoot: string;
    let artifact: DesignPreviewArtifact;
    const instanceKey = randomUUID();
    const canManage = ({ req }: { req: PayloadRequest }) =>
      Boolean(req.user?.roles?.includes("admin"));
    const options = sanitizeOptions({
      enabled: false,
      access: {
        canManageDesignWorkshop: canManage,
        canPreviewDesignWorkshop: canManage,
        canApproveRelease: () => false,
        canManageAIConfiguration: () => false,
        canManageData: () => false,
        canManageIntegrations: () => false,
        canUseChat: () => false,
        canViewRuns: () => false,
      },
      runtime: {
        isolated: true,
        mode: "local-development",
        controlPlaneTokenEnv: "PREVIEW_UNUSED_TOKEN",
      },
    });
    const request = async (
      actor: PayloadRequest["user"] = owner,
      key: string = randomUUID(),
    ) => {
      const req = await createLocalReq({ user: actor ?? undefined }, payload);
      req.headers.set("idempotency-key", key);
      return req;
    };
    const workshop = async (actor: PayloadRequest["user"] = owner) =>
      new DesignWorkshop(await request(actor), options);
    const api = async (actor: PayloadRequest["user"] = owner, key?: string) =>
      new DesignPreview(await request(actor, key), options);
    const database = () => (payload.db as unknown as PostgresAdapter).pool;
    const presence = () =>
      new WorkerPresenceRepository(database()).write({
        instanceKey,
        state: "idle",
        currentJob: null,
        capabilities: {
          execution: false,
          preview: false,
          sourcePromotion: false,
          release: false,
          workshopPreview: true,
        },
      });
    const create = async (code?: string) => {
      const input = designPreviewFixture();
      if (code) input.snapshot.files[0].content = code;
      const project = await (await workshop()).create(input);
      await presence();
      const job = await (
        await api()
      ).start(project.projectId, {
        revisionId: project.revision.revisionId,
        entryPath: "src/Preview.tsx",
      });
      return { project, job };
    };
    const startWorker = () =>
      fork(resolve("services/ai-execution-worker/src/worker.ts"), [], {
        execArgv: ["--import=tsx/esm"],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: {
          ...process.env,
          REALIZE_AI_RUNTIME_ISOLATED: "false",
          REALIZE_AI_EXECUTION_SIGNING_SECRET:
            "preview-fixture-signing-secret-".repeat(3),
          REALIZE_AI_WORKSPACE_ROOT: repositoryRoot,
          REALIZE_AI_PREVIEW_ROOT: join(fixture, "worker-previews"),
          REALIZE_AI_EXECUTION_POLL_MS: "250",
        },
      });
    const stopWorker = async (child: ReturnType<typeof startWorker>) => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
        try {
          await exited;
        } finally {
          clearTimeout(timer);
        }
      }
    };
    beforeAll(async () => {
      const url = new URL(process.env.WORKSHOP_PREVIEW_DATABASE_URI!);
      if (
        url.hostname !== "127.0.0.1" ||
        url.port !== "40261" ||
        !/^realize_workshop_fixture_preview[a-z0-9]*$/.test(
          url.pathname.slice(1),
        ) ||
        process.env.DATABASE_URI !== url.href
      )
        throw Error("ISOLATED_PREVIEW_DATABASE_REQUIRED");
      payload = await openMcpPayload();
      fixture = await mkdtemp(join(tmpdir(), "realize-workshop-capture-int-"));
      repositoryRoot = join(fixture, "checkout");
      await mkdir(repositoryRoot, { mode: 0o700 });
      await writeFile(
        join(repositoryRoot, "sentinel.ts"),
        'export default "HOST_SENTINEL";',
      );
      const user = async () => ({
        ...(await payload.create({
          collection: "users",
          overrideAccess: true,
          data: {
            email: "preview-" + randomUUID() + "@example.invalid",
            password: randomBytes(24).toString("base64url"),
            roles: ["admin"],
            name: "Preview fixture",
          },
        })),
        collection: "users" as const,
      });
      owner = await user();
      other = await user();
      queue = new DesignPreviewQueue(database());
      sandbox = new DesignPreviewSandbox(await readDesignPreviewToolchain());
      expect(await sandbox.ready()).toBe(true);
      staging = new DesignPreviewStaging(
        join(fixture, "captures"),
        repositoryRoot,
      );
      executor = new DesignPreviewExecutor({
        queue,
        sandbox,
        staging,
        repositoryRoot,
        source: (job) =>
          readDesignPreviewSource(
            payload,
            job.actorId,
            job.projectId,
            job.revisionId,
          ),
      });
    }, 30000);
    afterAll(async () => {
      if (queue && staging && sandbox) await staging.cleanup(queue, sandbox);
      await payload?.destroy();
      if (fixture) await rm(fixture, { recursive: true, force: true });
    });
    it("captures an exact saved React revision at three viewports and exposes only owner PNG", async () => {
      const { project, job } = await create();
      const claim = await queue.claimNext(instanceKey);
      expect(claim?.jobId).toBe(job.jobId);
      await executor.execute(claim!);
      const completed = await (await api()).get(project.projectId, job.jobId);
      expect(completed.state).toBe("completed");
      expect(completed.evidence?.source).toEqual(job.source);
      expect(completed.evidence?.entryPath).toBe("src/Preview.tsx");
      expect(completed.evidence?.toolchain.chromium).toMatch(/^\d+\./);
      expect(completed.evidence?.images.map((image) => image.width)).toEqual([
        390, 768, 1440,
      ]);
      expect(JSON.stringify(completed)).not.toMatch(
        /requestedBy|leaseToken|requestHash|directory|workerInstance/,
      );
      const row = await payload.find({
        collection: "realize-design-preview-jobs",
        where: { jobId: { equals: job.jobId } },
        depth: 0,
        overrideAccess: true,
      });
      artifact = {
        evidence: completed.evidence!,
        images: row.docs[0].images as DesignPreviewArtifact["images"],
      };
      const evidenceRoot = process.env.WORKSHOP_PREVIEW_EVIDENCE;
      if (
        evidenceRoot &&
        !resolve(evidenceRoot).startsWith(resolve(".ai-workspace/tasks") + "/")
      )
        throw Error("TASK_EVIDENCE_REQUIRED");
      if (evidenceRoot) await mkdir(evidenceRoot, { recursive: true });
      for (const width of [390, 768, 1440]) {
        const bytes = await (
          await api()
        ).image(project.projectId, job.jobId, String(width));
        expect(bytes.readUInt32BE(16)).toBe(width);
        expect(bytes.readUInt32BE(20)).toBe(900);
        if (evidenceRoot)
          await writeFile(
            join(resolve(evidenceRoot), "workshop-capture-" + width + ".png"),
            bytes,
          );
      }
      await expect(
        (await api(other)).image(project.projectId, job.jobId, "390"),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        (await api(null)).get(project.projectId, job.jobId),
      ).rejects.toMatchObject({ status: 401 });
      expect(await readdir(join(fixture, "captures"))).toEqual([]);
      expect(await readdir(repositoryRoot)).toEqual(["sentinel.ts"]);
    }, 90000);
    it("replays a request, rejects changed scope and admits only one active job", async () => {
      const project = await (await workshop()).create(designPreviewFixture());
      await presence();
      const key = randomUUID(),
        body = {
          revisionId: project.revision.revisionId,
          entryPath: "src/Preview.tsx",
        };
      const first = await (
        await api(owner, key)
      ).start(project.projectId, body);
      expect(
        (await (await api(owner, key)).start(project.projectId, body)).jobId,
      ).toBe(first.jobId);
      await expect(
        (await api(owner, key)).start(project.projectId, {
          ...body,
          entryPath: "src/Other.tsx",
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        (await api()).start(project.projectId, body),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await (await api()).cancel(project.projectId, first.jobId, {})).state,
      ).toBe("cancelled");
      expect(await queue.claimNext(instanceKey)).toBeUndefined();
      expect(
        (await (await api(owner, key)).start(project.projectId, body)).state,
      ).toBe("cancelled");
    });
    it("requires explicit preview permission and denies generic collection writes", async () => {
      const project = await (await workshop()).create(designPreviewFixture());
      const req = await request();
      const denied = new DesignPreview(req, {
        ...options,
        access: { ...options.access, canPreviewDesignWorkshop: undefined },
      });
      await expect(
        denied.start(project.projectId, {
          revisionId: project.revision.revisionId,
          entryPath: "src/Preview.tsx",
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        payload.find({
          collection: "realize-design-preview-jobs",
          overrideAccess: false,
          req,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
    it("fences a dead lease, survives reclaim, and prevents cancelled completion", async () => {
      const { project, job } = await create();
      const first = (await queue.claimNext(instanceKey))!;
      expect(first).toBeDefined();
      await database().query(
        "UPDATE realize_design_preview_jobs SET lease_until=clock_timestamp()-INTERVAL '1 second' WHERE job_id=$1",
        [job.jobId],
      );
      const second = (await queue.claimNext(randomUUID()))!;
      expect(second.leaseToken).not.toBe(first.leaseToken);
      expect(second.attempt).toBe(2);
      const evidence = {
        ...artifact,
        evidence: { ...artifact.evidence, source: second.source },
      };
      expect(await queue.renew(first)).toBe(false);
      expect(await queue.complete(first, evidence)).toBe(false);
      expect(await queue.fail(first, "INTERNAL_ERROR")).toBe(false);
      await (await api()).cancel(project.projectId, job.jobId, {});
      expect(await queue.complete(second, evidence)).toBe(false);
      expect(
        (await (await api()).get(project.projectId, job.jobId)).state,
      ).toBe("cancelled");
    });
    it("claims a queued job once across concurrent workers", async () => {
      const { project, job } = await create();
      const claims = await Promise.all(
        Array.from({ length: 8 }, () => queue.claimNext(randomUUID())),
      );
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(claims.find(Boolean)?.jobId).toBe(job.jobId);
      await (await api()).cancel(project.projectId, job.jobId, {});
    });
    it("cancels a running renderer and cleans its actual process and workspace", async () => {
      const { project, job } = await create(
        "export default function App(){while(true){} return <main>Недоступно</main>}",
      );
      const claim = (await queue.claimNext(instanceKey))!;
      const running = executor.execute(claim);
      await new Promise((resolve) => setTimeout(resolve, 700));
      await (await api()).cancel(project.projectId, job.jobId, {});
      await running;
      expect(
        (await (await api()).get(project.projectId, job.jobId)).state,
      ).toBe("cancelled");
      expect(await readdir(join(fixture, "captures"))).toEqual([]);
      const row = await database().query(
        "SELECT images FROM realize_design_preview_jobs WHERE job_id=$1",
        [job.jobId],
      );
      expect(row.rows[0].images).toBeNull();
    }, 90000);
    it("rechecks a revoked actor while the renderer is running", async () => {
      const { project, job } = await create(
        "export default function App(){while(true){} return <main>Недоступно</main>}",
      );
      const running = executor.execute((await queue.claimNext(instanceKey))!);
      await new Promise((resolve) => setTimeout(resolve, 700));
      await payload.update({
        collection: "users",
        id: owner.id,
        data: { roles: ["customer"] },
        overrideAccess: true,
      });
      try {
        await running;
      } finally {
        await payload.update({
          collection: "users",
          id: owner.id,
          data: { roles: ["admin"] },
          overrideAccess: true,
        });
      }
      const failed = await (await api()).get(project.projectId, job.jobId);
      expect(failed.state).toBe("failed");
      expect(failed.error).toBe("AUTH_REVOKED");
      expect(await readdir(join(fixture, "captures"))).toEqual([]);
    }, 90000);
    it("refuses a revoked actor before any workspace or browser is created", async () => {
      const { project, job } = await create();
      const claim = (await queue.claimNext(instanceKey))!;
      await payload.update({
        collection: "users",
        id: owner.id,
        data: { roles: ["customer"] },
        overrideAccess: true,
      });
      try {
        await executor.execute(claim);
      } finally {
        await payload.update({
          collection: "users",
          id: owner.id,
          data: { roles: ["admin"] },
          overrideAccess: true,
        });
      }
      const failed = await (await api()).get(project.projectId, job.jobId);
      expect(failed.state).toBe("failed");
      expect(failed.error).toBe("AUTH_REVOKED");
      expect(await readdir(join(fixture, "captures"))).toEqual([]);
    });
    it.each(["syntax", "host-import", "node-import"])(
      "fails %s without publishing older evidence",
      async (kind) => {
        const code =
          kind === "syntax"
            ? "export default function Broken(){ return <main>"
            : kind === "host-import"
              ? "import secret from " +
                JSON.stringify(join(repositoryRoot, "sentinel.ts")) +
                "; export default function App(){return <main>{secret}</main>}"
              : 'import fs from "node:fs"; export default function App(){return <main>{fs.readFileSync("/etc/passwd","utf8")}</main>}';
        const { project, job } = await create(code);
        await executor.execute((await queue.claimNext(instanceKey))!);
        const failed = await (await api()).get(project.projectId, job.jobId);
        expect(failed.state).toBe("failed");
        expect(failed.error).toBe("BUILD_FAILED");
        expect(failed.evidence).toBeNull();
        await expect(
          (await api()).image(project.projectId, job.jobId, "390"),
        ).rejects.toMatchObject({ status: 409 });
      },
      90000,
    );
    it("records a browser runtime failure rather than a successful blank image", async () => {
      const { project, job } = await create(
        'throw new Error("runtime fixture"); export default function App(){return <main>Недоступно</main>}',
      );
      await executor.execute((await queue.claimNext(instanceKey))!);
      const failed = await (await api()).get(project.projectId, job.jobId);
      expect(failed.state).toBe("failed");
      expect(failed.error).toBe("RENDER_FAILED");
    }, 90000);
    it("blocks browser access to the host network", async () => {
      let requests = 0;
      const listener = createServer((_, response) => {
        requests++;
        response.end("HOST_NETWORK_SENTINEL");
      });
      await new Promise<void>((resolve) =>
        listener.listen(0, "127.0.0.1", resolve),
      );
      const address = listener.address();
      if (!address || typeof address === "string")
        throw Error("Fixture listener unavailable");
      try {
        const url = "http://127.0.0.1:" + address.port + "/private";
        const { project, job } = await create(
          "export default function App(){return <main>Сеть<img src={" +
            JSON.stringify(url) +
            "}/></main>}",
        );
        await executor.execute((await queue.claimNext(instanceKey))!);
        expect(requests).toBe(0);
        expect(
          (await (await api()).get(project.projectId, job.jobId)).state,
        ).toBe("failed");
      } finally {
        await new Promise<void>((resolve, reject) =>
          listener.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }, 90000);
    it("rejects excessive PNG output without persisting unbounded images", async () => {
      const code =
        'import {useEffect,useRef} from "react"; export default function App(){const ref=useRef(null);useEffect(()=>{const ctx=ref.current.getContext("2d"),data=ctx.createImageData(1440,900);let n=12345;for(let i=0;i<data.data.length;i+=4){for(let j=0;j<3;j++){n^=n<<13;n^=n>>>17;n^=n<<5;data.data[i+j]=n&255}data.data[i+3]=255}ctx.putImageData(data,0,0)},[]);return <canvas ref={ref} width={1440} height={900}/> }';
      const { project, job } = await create(code);
      await executor.execute((await queue.claimNext(instanceKey))!);
      const failed = await (await api()).get(project.projectId, job.jobId);
      expect(failed.state).toBe("failed");
      expect(failed.error).toBe("LIMIT_EXCEEDED");
      expect(failed.evidence).toBeNull();
    }, 90000);
    it("expires artifacts, preserves replay identity and bounds recovery attempts", async () => {
      const { project, job } = await create();
      await database().query(
        "UPDATE realize_design_preview_jobs SET attempt=3 WHERE job_id=$1",
        [job.jobId],
      );
      await queue.cleanup();
      expect(
        (await (await api()).get(project.projectId, job.jobId)).error,
      ).toBe("ATTEMPTS_EXHAUSTED");
      await database().query(
        "UPDATE realize_design_preview_jobs SET expires_at=clock_timestamp()-INTERVAL '1 second' WHERE job_id=$1",
        [job.jobId],
      );
      await queue.cleanup();
      expect(
        (await (await api()).get(project.projectId, job.jobId)).state,
      ).toBe("expired");
      const result = await database().query(
        "SELECT images,evidence,lease_token FROM realize_design_preview_jobs WHERE job_id=$1",
        [job.jobId],
      );
      expect(result.rows[0]).toEqual({
        images: null,
        evidence: null,
        lease_token: null,
      });
    });
    it("preserves both MCP permission checks after sharing actor loading", async () => {
      const runtime = payload.config.custom[
        REALIZE_AI_SERVER_RUNTIME_KEY
      ] as RealizeAIServerRuntime;
      expect((await readMcpActor(payload, String(owner.id))).user?.id).toBe(
        owner.id,
      );
      for (const key of ["canUseChat", "canManageData"] as const) {
        const original = runtime[key];
        try {
          runtime[key] = () => false;
          await expect(
            readMcpActor(payload, String(owner.id)),
          ).rejects.toMatchObject({ status: 403 });
        } finally {
          runtime[key] = original;
        }
      }
    });
    it("serves validated API status, cancels with JSON, and rejects client actor/path fields", async () => {
      const project = await (await workshop()).create(designPreviewFixture());
      await presence();
      const endpoints = createDesignWorkshopEndpoints(options);
      const invoke = async (
        method: "get" | "post",
        suffix: string,
        body?: unknown,
        jobId?: string,
      ) => {
        const endpoint = endpoints.find(
          (value) => value.method === method && value.path.endsWith(suffix),
        )!;
        const req = await createLocalReq(
          {
            user: owner,
            req: new Request(
              "http://localhost/api/realize-ai/workshop/projects/" +
                project.projectId +
                "/previews",
              {
                method: method.toUpperCase(),
                headers: {
                  "content-type": "application/json",
                  "idempotency-key": randomUUID(),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
              },
            ) as PayloadRequest,
          },
          payload,
        );
        req.routeParams = {
          projectId: project.projectId,
          ...(jobId ? { jobId } : {}),
        };
        return endpoint.handler(req);
      };
      const command = {
        revisionId: project.revision.revisionId,
        entryPath: "src/Preview.tsx",
      };
      expect(
        (
          await invoke("post", "/:projectId/previews", {
            ...command,
            actorId: String(owner.id),
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await invoke("post", "/:projectId/previews", {
            ...command,
            entryPath: "/etc/passwd",
          })
        ).status,
      ).toBe(400);
      const response = await invoke("post", "/:projectId/previews", command);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const result = await response.json();
      expect(result.data.state).toBe("queued");
      const status = await invoke(
        "get",
        "/:projectId/previews/:jobId",
        undefined,
        result.data.jobId,
      );
      expect((await status.json()).data.jobId).toBe(result.data.jobId);
      expect(
        (
          await invoke(
            "post",
            "/:projectId/previews/:jobId/cancel",
            {},
            result.data.jobId,
          )
        ).status,
      ).toBe(200);
    });
    it("keeps a sandbox launch failure when no runner result exists and cleans its staging", async () => {
      const project = await (
        await workshop(other)
      ).create(designPreviewFixture());
      await presence();
      const job = await (
        await api(other)
      ).start(project.projectId, {
        revisionId: project.revision.revisionId,
        entryPath: "src/Preview.tsx",
      });
      const unavailable = new DesignPreviewSandbox({
        ...(await readDesignPreviewToolchain()),
        browser: "/nonexistent/realize-preview-browser/chrome",
      });
      const failing = new DesignPreviewExecutor({
        queue,
        staging,
        sandbox: unavailable,
        repositoryRoot,
        source: (claim) =>
          readDesignPreviewSource(
            payload,
            claim.actorId,
            claim.projectId,
            claim.revisionId,
          ),
      });
      const claim = await queue.claimNext(instanceKey);
      expect(claim?.jobId).toBe(job.jobId);
      await failing.execute(claim!);
      const failed = await (await api(other)).get(project.projectId, job.jobId);
      expect(failed.state).toBe("failed");
      expect(failed.error).toBe("RENDER_FAILED");
      expect(failed.evidence).toBeNull();
      expect(await readdir(join(fixture, "captures"))).toEqual([]);
    });
    it("processes the queue through the actual common worker with Codex disabled", async () => {
      const { project, job } = await create();
      const child = startWorker();
      try {
        let state = "queued";
        const until = Date.now() + 45000;
        while (Date.now() < until && ["queued", "running"].includes(state)) {
          if (child.exitCode !== null)
            throw Error("Common worker exited before preview");
          await new Promise((resolve) => setTimeout(resolve, 250));
          state = (await (await api()).get(project.projectId, job.jobId)).state;
        }
        expect(state).toBe("completed");
        const counts = await database().query(
          "SELECT (SELECT count(*)::int FROM realize_ai_execution_jobs) AS code_jobs,(SELECT count(*)::int FROM realize_ai_runs) AS model_runs",
        );
        expect(counts.rows[0]).toEqual({ code_jobs: 0, model_runs: 0 });
      } finally {
        await stopWorker(child);
      }
    }, 60000);
    it("recovers after the actual worker is killed, stops its old sandbox and fences its attempt", async () => {
      const code =
        'import {useState,useEffect} from "react"; export default function App(){const [ready,set]=useState(false);useEffect(()=>{const timer=setTimeout(()=>set(true),4000);return ()=>clearTimeout(timer)},[]);return ready?<main>Восстановленная версия</main>:null}';
      const { project, job } = await create(code);
      const first = startWorker();
      let second: ReturnType<typeof startWorker> | undefined,
        oldToken: string | undefined;
      const ownStaging = new DesignPreviewStaging(
        designPreviewStorageRoot(
          join(fixture, "worker-previews"),
          process.env.DATABASE_URI!,
        ),
        repositoryRoot,
      );
      try {
        const until = Date.now() + 30000;
        let active = false;
        while (Date.now() < until && !active) {
          const row = (
            await database().query(
              "SELECT lease_token FROM realize_design_preview_jobs WHERE job_id=$1",
              [job.jobId],
            )
          ).rows[0];
          oldToken = row.lease_token ?? undefined;
          if (oldToken) {
            const status = await promisify(execFile)(
              "/usr/bin/systemctl",
              [
                "--user",
                "show",
                staging.unit(job.jobId, oldToken),
                "--property=ActiveState",
                "--value",
              ],
              { timeout: 3000, maxBuffer: 1024 },
            );
            active = status.stdout.trim() === "active";
          }
          if (!active) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(active).toBe(true);
        const exited = once(first, "exit");
        first.kill("SIGKILL");
        await exited;
        // Часы lease сдвигаются только в disposable fixture, чтобы не ждать 30 секунд.
        await database().query(
          "UPDATE realize_design_preview_jobs SET lease_until=clock_timestamp()-INTERVAL '1 second' WHERE job_id=$1",
          [job.jobId],
        );
        second = startWorker();
        let state = "running";
        const recoveryDeadline = Date.now() + 45000;
        while (
          Date.now() < recoveryDeadline &&
          ["queued", "running"].includes(state)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          state = (await (await api()).get(project.projectId, job.jobId)).state;
        }
        const recovered = await (await api()).get(project.projectId, job.jobId);
        expect(recovered.state).toBe("completed");
        expect(recovered.attempt).toBe(2);
        expect(recovered.source).toEqual(job.source);
        const oldState = await promisify(execFile)(
          "/usr/bin/systemctl",
          [
            "--user",
            "show",
            staging.unit(job.jobId, oldToken!),
            "--property=ActiveState",
            "--value",
          ],
          { timeout: 3000, maxBuffer: 1024 },
        );
        expect(oldState.stdout.trim()).toBe("inactive");
      } finally {
        await stopWorker(first);
        if (second) await stopWorker(second);
        await (await api()).cancel(project.projectId, job.jobId, {});
        if (oldToken) await sandbox.stop(staging.unit(job.jobId, oldToken));
        await ownStaging.cleanup(queue, sandbox);
      }
    }, 90000);
  },
);
