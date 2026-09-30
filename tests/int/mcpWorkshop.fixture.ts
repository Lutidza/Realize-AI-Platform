/**
 * @file tests/int/mcpWorkshop.fixture.ts
 * @version 1.0.0
 * @date 2026-09-26
 * @description Поднимает настоящий managed MCP и sandbox над одноразовой PostgreSQL для Workshop проверок.
 * @see documentation/specifications/design-workshop.md
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { createLocalReq, type PayloadRequest } from "payload";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  MCP_DEFAULT_LIMITS,
  MCP_REALIZE_TOOLS,
  type McpClientGrants,
  type McpHostedConfiguration,
  type McpWorkshopToolName,
  type McpWorkshopIdentity,
} from "@realize/ai-contracts";
import {
  readDesignPreviewSource,
  executeMcpWorkshop,
} from "@realize/payload-ai-control/server/workshop";
import { WorkerPresenceRepository } from "@realize/payload-ai-control/server/integration-runtime";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";
import { createManagedMcpRuntime } from "../../services/internal-mcp/src/createManagedMcpRuntime.config";
import { createMcpHttpServer } from "../../services/internal-mcp/src/createMcpHttpServer.controller";
import { McpManagement } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpManagement.service";
import { McpClients } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpClients.service";
import { DesignPreviewQueue } from "../../services/ai-execution-worker/src/design-workshop/DesignPreviewQueue.repository";
import { DesignPreviewExecutor } from "../../services/ai-execution-worker/src/design-workshop/DesignPreviewExecutor.service";
import { DesignPreviewStaging } from "../../services/ai-execution-worker/src/design-workshop/DesignPreviewStaging.repository";
import { DesignPreviewSandbox } from "../../services/ai-execution-worker/src/design-workshop/DesignPreviewSandbox.adapter";
import { readDesignPreviewToolchain } from "../../services/ai-execution-worker/src/design-workshop/designPreviewToolchain.config";

export const workshopFixtureGrants: McpClientGrants = {
  repositoryRead: false,
  pagesRead: false,
  workshopRead: true,
  workshopWrite: true,
  workshopPreview: true,
};

export async function openWorkshopMcpFixture() {
  const url = new URL(process.env.WORKSHOP_MCP_TEST_DATABASE_URI!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "40261");
  assert.match(url.pathname, /^\/realize_mcp_fixture_workshop[a-z0-9]+$/);
  assert.equal(url.href, process.env.DATABASE_URI);
  const directory = await mkdtemp(join(tmpdir(), "realize-mcp-workshop-"));
  const repositoryRoot = join(directory, "checkout");
  await mkdir(repositoryRoot);
  const port = await new Promise<number>((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const port = (socket.address() as { port: number }).port;
      socket.close(() => resolve(port));
    });
  });
  process.env.REALIZE_MCP_CONTROL_WORKSHOP_FIXTURE =
    randomBytes(32).toString("base64url");
  const profile = {
    id: "workshop-fixture",
    label: "Workshop fixture",
    repositoryRoot: null,
    repositoryServerIDs: [],
    allowedPorts: [port],
    pagesRead: false,
    workshop: true,
    controlTokenEnv: "REALIZE_MCP_CONTROL_WORKSHOP_FIXTURE",
    maximumLimits: { ...MCP_DEFAULT_LIMITS },
  };
  const profiles = (allowed = true) => {
    process.env.REALIZE_MCP_HOST_PROFILES = JSON.stringify([
      { ...profile, workshop: allowed },
    ]);
  };
  profiles();
  const payload = await openMcpPayload();
  const pool = (payload.db as unknown as PostgresAdapter).pool;
  const user = async () => ({
    ...(await payload.create({
      collection: "users",
      overrideAccess: true,
      data: {
        email: `mcp-workshop-${randomUUID()}@example.invalid`,
        password: randomBytes(32).toString("base64url"),
        roles: ["admin"],
        name: "Workshop fixture",
      },
    })),
    collection: "users" as const,
  });
  const actor = await user(),
    other = await user();
  const manager = async (owner: NonNullable<PayloadRequest["user"]> = actor) =>
    new McpManagement({
      req: await createLocalReq({ user: owner }, payload),
      actor: owner,
      requestKey: randomUUID(),
    });
  let configuration: McpHostedConfiguration = {
    schemaVersion: "1.0",
    adapterVersion: "1.0",
    serverType: "realize-internal",
    direction: "hosted_endpoint",
    managementSource: "admin_managed",
    hostProfileID: profile.id,
    port,
    environment: "workshop-fixture",
    allowedTools: [...MCP_REALIZE_TOOLS],
    limits: { ...MCP_DEFAULT_LIMITS },
  };
  const server = (
    await (
      await manager()
    ).create({ displayName: "Workshop MCP fixture", configuration })
  ).server;
  const detail = async () => (await manager()).detail(server.serverID);
  const runtime = await createManagedMcpRuntime(payload, {
    ...process.env,
    REALIZE_MCP_CONFIGURATION_MODE: "managed",
    REALIZE_MCP_SERVER_ID: server.serverID,
    REALIZE_MCP_HOST_PROFILE_ID: profile.id,
  });
  // Quota tests живут в protocol suite; здесь сохраняются auth и wire limits, снимается только ожидание refill.
  const authorize = runtime.options.authorize;
  runtime.options.authorize = async (token) => {
    const value = await authorize(token);
    return {
      ...value,
      limits: { ...value.limits, callsPerMinute: 1000, burst: 1000 },
    };
  };
  const listener = await createMcpHttpServer(runtime.options);
  await runtime.start();
  const apply = async () => {
    await (
      await manager()
    ).apply(server.serverID, (await detail()).desiredRevision);
    await runtime.runtime.refresh();
  };
  await (
    await manager()
  ).enabled(server.serverID, {
    expectedRevision: (await detail()).desiredRevision,
    enabled: true,
  });
  const clients: Client[] = [];
  const issue = async (
    grants = workshopFixtureGrants,
    owner = actor,
    applyNow = true,
  ) => {
    const issued = await new McpClients(await manager(owner)).issue(
      server.serverID,
      {
        displayName: "Workshop tool client",
        expectedRevision: (await detail()).desiredRevision,
        grants,
        actorBinding: "self",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    );
    if (applyNow) await apply();
    return {
      token: issued.token!,
      identity: {
        serverID: server.serverID,
        clientID: issued.client.clientID,
        clientRevision: 1,
      } satisfies McpWorkshopIdentity,
      actorId: String(owner.id),
    };
  };
  const access = await issue();
  const connect = async (
    token = access.token,
    era: "modern" | "legacy" = "modern",
  ) => {
    const client = new Client(
      { name: "workshop-fixture", version: "1.0.0" },
      {
        versionNegotiation: {
          mode: era === "modern" ? { pin: "2026-07-28" } : "legacy",
        },
        supportedProtocolVersions: [
          era === "modern" ? "2026-07-28" : "2025-11-25",
        ],
      },
    );
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${listener.origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    return client;
  };
  const direct = (
    identity: typeof access,
    tool: McpWorkshopToolName,
    input: unknown,
    responseBytes = 131072,
    signal = new AbortController().signal,
  ) =>
    executeMcpWorkshop(
      payload,
      identity.actorId,
      identity.identity,
      tool,
      input,
      signal,
      responseBytes,
    );
  const instanceKey = randomUUID();
  const presence = () =>
    new WorkerPresenceRepository(pool).write({
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
  const queue = new DesignPreviewQueue(pool);
  const sandbox = new DesignPreviewSandbox(await readDesignPreviewToolchain());
  assert.ok(await sandbox.ready());
  const staging = new DesignPreviewStaging(
    join(directory, "captures"),
    repositoryRoot,
  );
  const executor = new DesignPreviewExecutor({
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
        job.mcpAuthorization,
      ),
  });
  return {
    payload,
    pool,
    actor,
    other,
    server,
    detail,
    manager,
    issue,
    access,
    connect,
    direct,
    presence,
    queue,
    executor,
    sandbox,
    staging,
    instanceKey,
    profiles,
    revoke: async (clientID: string) =>
      new McpClients(await manager()).revoke(
        server.serverID,
        clientID,
        (await detail()).desiredRevision,
      ),
    rotate: async (clientID: string) =>
      new McpClients(await manager()).rotate(
        server.serverID,
        clientID,
        (await detail()).desiredRevision,
      ),
    configure: async (patch: Partial<McpHostedConfiguration>) => {
      configuration = { ...configuration, ...patch };
      await (
        await manager()
      ).update(server.serverID, {
        displayName: server.displayName,
        configuration,
        expectedRevision: (await detail()).desiredRevision,
      });
      await apply();
    },
    close: async () => {
      await Promise.allSettled(clients.map((client) => client.close()));
      await listener.close();
      await staging.cleanup(queue, sandbox);
      await payload.destroy();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
