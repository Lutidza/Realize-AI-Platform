/**
 * @file tests/int/mcp-managed.int.spec.ts
 * @version 1.3.1
 * @date 2026-10-22
 * @description Проверяет MCP registry, grants и Pages на отдельной PostgreSQL с настоящим Payload.
 */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { createLocalReq, type Payload, type PayloadRequest } from "payload";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Client as PgClient } from "pg";
import {
  MCP_DEFAULT_LIMITS,
  MCP_REALIZE_TOOLS,
  MCP_SERVER_PRESETS,
  parsePageDraftContext,
  type McpHostedConfiguration,
  type McpServerDetailDto,
} from "@realize/ai-contracts";
import { disposableGitFixture } from "./fixtures/disposableGit.fixture";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";
import { createManagedMcpRuntime } from "../../services/internal-mcp/src/createManagedMcpRuntime.config";
import { createMcpHttpServer } from "../../services/internal-mcp/src/createMcpHttpServer.controller";
import { McpManagement } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpManagement.service";
import { McpPresets } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpPresets.service";
import { installMcpPresetsAfterLogin } from "../../packages/payload-ai-plugin/src/integrations/mcp/installMcpPresetsAfterLogin.hook";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";
import { McpClients } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpClients.service";
import { McpRuntime } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpRuntime.service";
import { probeMcpServer } from "../../packages/payload-ai-plugin/src/integrations/mcp/probeMcpServer.service";
import { readMcpHostProfiles } from "../../packages/payload-ai-plugin/src/integrations/mcp/readMcpHostProfiles.config";
import { readMcpPage } from "../../packages/payload-ai-plugin/src/integrations/mcp/readMcpPage.service";
import { MCP_CLIENTS_SLUG } from "../../packages/payload-ai-plugin/src/collections/McpClients.collection";

const enabled = Boolean(process.env.MCP_TEST_DATABASE_URI);
describe.skipIf(!enabled)("managed MCP on isolated PostgreSQL", () => {
  let payload: Payload;
  let actor: NonNullable<PayloadRequest["user"]>;
  let root: string;
  let config: McpHostedConfiguration;
  let server: McpServerDetailDto;
  let runtime: Awaited<ReturnType<typeof createManagedMcpRuntime>>;
  let listener: Awaited<ReturnType<typeof createMcpHttpServer>>;
  let token: string;
  let clientID: string;
  let pageID: string;
  const management = async (key = randomUUID()) =>
    new McpManagement({
      req: await createLocalReq({ user: actor }, payload),
      actor,
      requestKey: key,
    });
  const fresh = async () => {
    server = await (await management()).detail(server.serverID);
    return server;
  };
  const apply = async () => {
    await (
      await management()
    ).apply(server.serverID, (await fresh()).desiredRevision);
    await runtime.runtime.refresh();
    await fresh();
  };

  beforeAll(async () => {
    const url = new URL(process.env.MCP_TEST_DATABASE_URI!);
    if (
      url.hostname !== "127.0.0.1" ||
      !/^realize_mcp_fixture(?:_[a-z0-9]+)?$/.test(url.pathname.slice(1)) ||
      process.env.DATABASE_URI !== url.href
    )
      throw new Error("ISOLATED_MCP_DATABASE_REQUIRED");
    root = await mkdtemp(join(tmpdir(), "realize-mcp-managed-"));
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src/example.ts"),
      "export const managed = true;\n",
    );
    await disposableGitFixture(root).run(["init", "-q"]);
    const port = await new Promise<number>((resolve, reject) => {
      const socket = createServer();
      socket.once("error", reject);
      socket.listen(0, "127.0.0.1", () => {
        const port = (socket.address() as { port: number }).port;
        socket.close(() => resolve(port));
      });
    });
    process.env.REALIZE_MCP_CONTROL_FIXTURE ??=
      randomBytes(32).toString("base64url");
    const profile = {
      id: "fixture",
      label: "Одноразовый процесс",
      repositoryRoot: root,
      repositoryServerIDs: [] as string[],
      allowedPorts: [port, port + 1],
      pagesRead: true,
      controlTokenEnv: "REALIZE_MCP_CONTROL_FIXTURE",
      maximumLimits: { ...MCP_DEFAULT_LIMITS },
    };
    process.env.REALIZE_MCP_HOST_PROFILES = JSON.stringify([profile]);
    payload = await openMcpPayload();
    const user = await payload.create({
      collection: "users",
      data: {
        email: `mcp-${randomUUID()}@example.invalid`,
        password: randomBytes(32).toString("base64url"),
        name: "MCP fixture",
        roles: ["admin"],
      },
      overrideAccess: true,
    });
    actor = { ...user, collection: "users" };
    config = {
      schemaVersion: "1.0",
      adapterVersion: "1.0",
      serverType: "realize-internal",
      direction: "hosted_endpoint",
      managementSource: "admin_managed",
      hostProfileID: "fixture",
      port,
      environment: "mcp-fixture",
      allowedTools: [...MCP_REALIZE_TOOLS],
      limits: { ...MCP_DEFAULT_LIMITS },
    };
    server = (
      await (
        await management()
      ).create({ displayName: "Managed MCP fixture", configuration: config })
    ).server;
    profile.repositoryServerIDs = [server.serverID];
    process.env.REALIZE_MCP_HOST_PROFILES = JSON.stringify([profile]);
    runtime = await createManagedMcpRuntime(payload, {
      ...process.env,
      REALIZE_MCP_CONFIGURATION_MODE: "managed",
      REALIZE_MCP_SERVER_ID: server.serverID,
      REALIZE_MCP_HOST_PROFILE_ID: "fixture",
    });
    listener = await createMcpHttpServer(runtime.options);
    await runtime.start();
    await fresh();
  }, 60000);
  afterAll(async () => {
    await listener?.close();
    await payload?.destroy();
    if (root) await rm(root, { recursive: true, force: true });
  }, 15000);

  it("persists list filters, disabled defaults and independent instances", async () => {
    expect(server.enabled).toBe(false);
    const second = await (
      await management()
    ).create({ displayName: "Second MCP fixture", configuration: config });
    expect(second.server.serverID).not.toBe(server.serverID);
    const list = await (
      await management()
    ).list({
      q: "MCP fixture",
      serverType: "realize-internal",
      environment: "mcp-fixture",
      enabled: false,
      page: 1,
      limit: 1,
    });
    expect(list.totalDocs).toBeGreaterThanOrEqual(2);
    expect(list.items).toHaveLength(1);
    expect((await fresh()).clientGrantOptions.repositoryRead).toBe(true);
    await expect(
      new McpClients(await management()).issue(second.server.serverID, {
        expectedRevision: 1,
        displayName: "No grant",
        grants: { repositoryRead: true, pagesRead: false },
        actorBinding: "none",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("installs presets concurrently without grants and preserves operator edits on retry", async () => {
    const presetID = MCP_SERVER_PRESETS[0]!.serverID;
    // Этот suite допускает только отдельную fixture DB; удаляем только preset текущего сценария.
    await payload.delete({
      collection: "realize-ai-integrations",
      where: { connectionKey: { equals: `mcp:${presetID}` } },
      overrideAccess: true,
    });
    const results = await Promise.all(
      Array.from({ length: 3 }, async () =>
        new McpPresets(await management()).install(),
      ),
    );
    expect(results.flatMap((result) => result.createdServerIDs)).toEqual([
      presetID,
    ]);
    const manager = await management();
    const first = await manager.detail(presetID);
    expect(first.enabled).toBe(false);
    expect(first.clients).toEqual([]);
    expect(first.hasCredential).toBe(false);
    expect(first.actions.enable.allowed).toBe(false);
    expect(first.clientGrantOptions).toEqual({
      repositoryRead: false,
      pagesRead: false,
      workshopRead: false,
      workshopWrite: false,
      workshopPreview: false,
    });
    expect(first.configuration).toEqual(MCP_SERVER_PRESETS[0]!.configuration);
    const changed = (
      await manager.update(presetID, {
        displayName: "Operator name",
        configuration: { ...config, allowedTools: ["realize_get_context"] },
        expectedRevision: first.desiredRevision,
      })
    ).server;
    await new McpPresets(await management()).install();
    expect(await manager.detail(presetID)).toEqual(changed);
    expect(
      (await manager.repository.events(presetID, 1)).docs
        .filter((event) => event.action === "mcp_created")
        .at(0)?.summary,
    ).toContain("предустановленный");
    expect((await new McpPresets(manager).list())[0]?.installed).toBe(true);
  });

  it("seeds on manager login and leaves non-manager login read-only", async () => {
    const presetID = MCP_SERVER_PRESETS[0]!.serverID;
    await payload.delete({
      collection: "realize-ai-integrations",
      where: { connectionKey: { equals: `mcp:${presetID}` } },
      overrideAccess: true,
    });
    const req = await createLocalReq({ user: actor }, payload);
    let permitted = false;
    const hook = installMcpPresetsAfterLogin(
      sanitizeOptions({
        access: {
          canApproveRelease: () => false,
          canManageAIConfiguration: () => false,
          canManageData: () => false,
          canManageIntegrations: ({ req: context }) =>
            permitted && context.user?.id === actor.id,
          canUseChat: () => false,
          canViewRuns: () => false,
        },
        runtime: {
          controlPlaneTokenEnv: "REALIZE_AI_CONTROL_PLANE_TOKEN",
          mode: "local-development",
        },
      }),
    );
    const input = {
      user: actor,
      req,
      collection: payload.collections.users.config,
      context: {},
      token: "unused-fixture",
    };
    expect(await hook(input)).toEqual(actor);
    expect(
      (await new McpPresets(await management()).list())[0]?.installed,
    ).toBe(false);
    permitted = true;
    await hook(input);
    expect(
      (await new McpPresets(await management()).list())[0]?.installed,
    ).toBe(true);
    const first = await (await management()).detail(presetID);
    await hook(input);
    expect(await (await management()).detail(presetID)).toEqual(first);
  });

  it("starts the managed controller after production environment preload", async () => {
    const launched = (
      await (
        await management()
      ).create({
        displayName: "Preload fixture",
        configuration: { ...config, port: config.port + 1 },
      })
    ).server;
    const child = spawn(
      process.execPath,
      [
        "--import=./scripts/runtime/loadProductionEnvironment.mjs",
        "--import=tsx/esm",
        "services/internal-mcp/src/runMcp.controller.ts",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "production",
          REALIZE_MCP_CONFIGURATION_MODE: "managed",
          REALIZE_MCP_SERVER_ID: launched.serverID,
          REALIZE_MCP_HOST_PROFILE_ID: "fixture",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    const exited = new Promise<void>((resolve) =>
      child.once("close", () => resolve()),
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("MCP launcher did not become ready")),
          20000,
        );
        child.once("error", () => {
          clearTimeout(timer);
          reject(new Error("MCP launcher spawn failed"));
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(new Error("MCP launcher exited before readiness"));
        });
        child.stderr.on("data", (chunk: Buffer) => {
          if (chunk.toString().includes("Listener готов:")) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      expect(
        (await fetch(`http://127.0.0.1:${config.port + 1}/health`)).status,
      ).toBe(200);
    } finally {
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(timer);
    }
  }, 30000);

  it("CAS allows one concurrent writer; replay keeps identity and checks input", async () => {
    const revision = (await fresh()).desiredRevision;
    const input = {
      expectedRevision: revision,
      displayName: "Updated MCP fixture",
      configuration: config,
    };
    const key = randomUUID();
    const results = await Promise.allSettled([
      (await management(key)).update(server.serverID, input),
      (await management()).update(server.serverID, {
        ...input,
        displayName: "Conflicting name",
      }),
    ]);
    expect(
      results.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    expect(results.find((entry) => entry.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    // Отдельный однозначный key подтверждает durable replay независимо от победителя CAS.
    const replayKey = randomUUID();
    const next = {
      ...input,
      expectedRevision: (await fresh()).desiredRevision,
    };
    const saved = await (
      await management(replayKey)
    ).update(server.serverID, next);
    const replay = await (
      await management(replayKey)
    ).update(server.serverID, next);
    expect(replay.replayed).toBe(true);
    expect(replay.server.desiredRevision).toBe(saved.server.desiredRevision);
    await expect(
      (await management(replayKey)).update(server.serverID, {
        ...next,
        displayName: "Changed replay",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("issues one-time tokens, stores only verifier, and withholds new grants until apply", async () => {
    server = (
      await (
        await management()
      ).enabled(server.serverID, {
        expectedRevision: (await fresh()).desiredRevision,
        enabled: true,
      })
    ).server;
    const key = randomUUID();
    const input = {
      expectedRevision: server.desiredRevision,
      displayName: "Repository client",
      grants: { repositoryRead: true, pagesRead: false },
      actorBinding: "none" as const,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    const issued = await new McpClients(await management(key)).issue(
      server.serverID,
      input,
    );
    token = issued.token!;
    clientID = issued.client.clientID;
    const replay = await new McpClients(await management(key)).issue(
      server.serverID,
      input,
    );
    expect(replay).toMatchObject({
      token: null,
      replayed: true,
      client: { clientID },
    });
    const raw = await (
      await management()
    ).repository.client(server.serverID, clientID);
    expect(raw.verifier).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(raw)).not.toContain(token);
    expect(JSON.stringify(await fresh())).not.toContain(token);
    const events = await (
      await management()
    ).repository.events(server.serverID, 1);
    expect(JSON.stringify(events)).not.toContain(token);
    await expect(runtime.runtime.authorize(token)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await apply();
    expect(await runtime.runtime.authorize(token)).toMatchObject({
      repositoryRead: true,
      pagesRead: false,
    });
  });

  it("serves a real SDK client and performs discovery without tools/call", async () => {
    const client = new Client({ name: "managed-proof", version: "1.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${config.port}/mcp`),
          { requestInit: { headers: { authorization: `Bearer ${token}` } } },
        ),
      );
      const result = await client.callTool({
        name: "repo_read_file",
        arguments: { path: "src/example.ts" },
      });
      expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(
        true,
      );
      expect(result.structuredContent).toMatchObject({
        data: { sourceUrl: expect.stringMatching(/^https?:\/\//) },
      });
      expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(
        result.structuredContent,
      );
    } finally {
      await client.close();
    }
    const key = randomUUID();
    const revision = (await fresh()).desiredRevision;
    const result = await probeMcpServer(
      await management(key),
      server.serverID,
      revision,
      true,
    );
    expect(result.status).toBe("passed");
    expect(result.tools.map((tool) => tool.name).sort()).toEqual(
      MCP_REALIZE_TOOLS.filter((name) => !name.startsWith("workshop_")).sort(),
    );
    expect((await fresh()).discoveredTools.length).toBe(
      MCP_REALIZE_TOOLS.filter((name) => !name.startsWith("workshop_")).length,
    );
    await (
      await management()
    ).update(server.serverID, {
      expectedRevision: server.desiredRevision,
      displayName: server.displayName,
      configuration: config,
    });
    expect(
      (
        await probeMcpServer(
          await management(key),
          server.serverID,
          revision,
          true,
        )
      ).replayed,
    ).toBe(true);
  });

  it("shrinks allowlists immediately, expands only after apply, and disables immediately", async () => {
    await fresh();
    server = (
      await (
        await management()
      ).update(server.serverID, {
        expectedRevision: server.desiredRevision,
        displayName: server.displayName,
        configuration: { ...config, allowedTools: ["realize_get_context"] },
      })
    ).server;
    expect((await runtime.runtime.authorize(token)).allowedTools).toEqual([
      "realize_get_context",
    ]);
    await apply();
    server = (
      await (
        await management()
      ).update(server.serverID, {
        expectedRevision: server.desiredRevision,
        displayName: server.displayName,
        configuration: config,
      })
    ).server;
    expect((await runtime.runtime.authorize(token)).allowedTools).toEqual([
      "realize_get_context",
    ]);
    await apply();
    expect((await runtime.runtime.authorize(token)).allowedTools).toContain(
      "repo_read_file",
    );
    server = (
      await (
        await management()
      ).enabled(server.serverID, {
        expectedRevision: server.desiredRevision,
        enabled: false,
      })
    ).server;
    await expect(runtime.runtime.authorize(token)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    server = (
      await (
        await management()
      ).enabled(server.serverID, {
        expectedRevision: server.desiredRevision,
        enabled: true,
      })
    ).server;
    await apply();
  });

  it("rotate invalidates the old token immediately; revoke survives a late heartbeat", async () => {
    const rotated = await new McpClients(await management()).rotate(
      server.serverID,
      clientID,
      (await fresh()).desiredRevision,
    );
    await expect(runtime.runtime.authorize(token)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    token = rotated.token!;
    await expect(runtime.runtime.authorize(token)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await apply();
    expect((await runtime.runtime.authorize(token)).repositoryRead).toBe(true);
    await new McpClients(await management()).revoke(
      server.serverID,
      clientID,
      server.desiredRevision,
    );
    await runtime.runtime.refresh();
    await expect(runtime.runtime.authorize(token)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("reads real Pages with current user ACL and no provider credential", async () => {
    const req = await createLocalReq(
      { user: actor, context: { disableRevalidate: true } },
      payload,
    );
    const page = await payload.create({
      collection: "pages",
      data: {
        title: "MCP Page fixture",
        slug: `mcp-${randomUUID()}`,
        _status: "draft",
        hero: { type: "none" },
        layout: [],
      },
      draft: true,
      req,
      overrideAccess: false,
    });
    pageID = String(page.id);
    const list = await readMcpPage(
      payload,
      String(actor.id),
      "pages_list",
      { query: "MCP Page fixture", page: 1 },
      AbortSignal.timeout(15000),
    );
    expect(JSON.stringify(list)).toContain("MCP Page fixture");
    const context = await readMcpPage(
      payload,
      String(actor.id),
      "pages_get",
      { pageID },
      AbortSignal.timeout(15000),
    );
    expect(JSON.stringify(context)).toContain("MCP Page fixture");
    const structure = await readMcpPage(
      payload,
      String(actor.id),
      "pages_get_structure",
      { pageID },
      AbortSignal.timeout(15000),
    );
    expect(structure).toBeTruthy();
    const issued = await new McpClients(await management()).issue(
      server.serverID,
      {
        expectedRevision: (await fresh()).desiredRevision,
        displayName: "Pages actor",
        grants: { pagesRead: true, repositoryRead: false },
        actorBinding: "self",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    );
    await apply();
    const sdk = new Client({ name: "pages-proof", version: "1.0" });
    try {
      await sdk.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${config.port}/mcp`),
          {
            requestInit: {
              headers: { authorization: `Bearer ${issued.token}` },
            },
          },
        ),
      );
      for (const name of [
        "pages_list",
        "pages_get",
        "pages_get_structure",
      ] as const) {
        const result = await sdk.callTool({
          name,
          arguments:
            name === "pages_list" ? { query: "MCP Page fixture" } : { pageID },
        });
        expect(
          result.isError,
          JSON.stringify(result.structuredContent),
        ).not.toBe(true);
      }
    } finally {
      await sdk.close();
    }
    await payload.update({
      collection: "users",
      id: actor.id,
      data: { roles: ["customer"] },
      overrideAccess: true,
    });
    await expect(
      readMcpPage(
        payload,
        String(actor.id),
        "pages_get",
        { pageID },
        AbortSignal.timeout(15000),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      runtime.runtime.authorize(issued.token!),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await payload.update({
      collection: "users",
      id: actor.id,
      data: { roles: ["admin"] },
      overrideAccess: true,
    });
  });

  it("hides raw key collections from the authenticated Admin REST identity", async () => {
    const req = await createLocalReq({ user: actor }, payload);
    await expect(
      payload.find({
        collection: MCP_CLIENTS_SLUG,
        req,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("enforces page update ACL and hides unreadable form references", async () => {
    const pageAccess = payload.collections.pages.config.access;
    const originalUpdate = pageAccess.update;
    pageAccess.update = () => false;
    try {
      await expect(
        readMcpPage(
          payload,
          String(actor.id),
          "pages_get",
          { pageID },
          AbortSignal.timeout(15000),
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      pageAccess.update = originalUpdate;
    }
    const form = await payload.create({
      collection: "forms",
      data: {
        title: "Private MCP form fixture",
        fields: [],
        confirmationType: "redirect",
        redirect: { url: "/thanks" },
      },
      overrideAccess: true,
    });
    await payload.update({
      collection: "pages",
      id: Number(pageID),
      data: { layout: [{ blockType: "formBlock", form: form.id }] },
      draft: true,
      req: await createLocalReq(
        { user: actor, context: { disableRevalidate: true } },
        payload,
      ),
      overrideAccess: false,
    });
    const formAccess = payload.collections.forms.config.access;
    const originalRead = formAccess.read;
    formAccess.read = () => false;
    try {
      const context = parsePageDraftContext(
        await readMcpPage(
          payload,
          String(actor.id),
          "pages_get",
          { pageID },
          AbortSignal.timeout(15000),
        ),
      );
      expect(context.knowledge?.outline.blocks[0].references).toEqual([
        { field: "form", collection: "forms", id: null, access: "unavailable" },
      ]);
      expect(JSON.stringify(context)).not.toContain("Private MCP form fixture");
    } finally {
      formAccess.read = originalRead;
    }
  });

  it("rejects unknown keys and a deleted Pages actor immediately", async () => {
    const unknown = `mcp.${randomUUID()}.${randomBytes(32).toString("base64url")}`;
    const response = await fetch(`http://127.0.0.1:${config.port}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${unknown}` },
      body: "{}",
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    const user = await payload.create({
      collection: "users",
      data: {
        email: `deleted-mcp-${randomUUID()}@example.invalid`,
        password: randomBytes(32).toString("base64url"),
        roles: ["admin"],
      },
      overrideAccess: true,
    });
    expect(
      await readMcpPage(
        payload,
        String(user.id),
        "pages_get",
        { pageID },
        AbortSignal.timeout(15000),
      ),
    ).toBeTruthy();
    await payload.delete({
      collection: "users",
      id: user.id,
      overrideAccess: true,
    });
    await expect(
      readMcpPage(
        payload,
        String(user.id),
        "pages_get",
        { pageID },
        AbortSignal.timeout(15000),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cancels a real blocked Pages query before releasing its transaction", async () => {
    const blocker = new PgClient({
      connectionString: process.env.MCP_TEST_DATABASE_URI,
    });
    await blocker.connect();
    try {
      await blocker.query(
        "BEGIN; LOCK TABLE pages, _pages_v IN ACCESS EXCLUSIVE MODE",
      );
      const started = Date.now();
      await expect(
        readMcpPage(
          payload,
          String(actor.id),
          "pages_list",
          { query: "MCP", page: 1 },
          AbortSignal.timeout(300),
        ),
      ).rejects.toBeTruthy();
      expect(Date.now() - started).toBeLessThan(2500);
    } finally {
      await blocker.query("ROLLBACK");
      await blocker.end();
    }
    expect(
      await readMcpPage(
        payload,
        String(actor.id),
        "pages_get",
        { pageID },
        AbortSignal.timeout(15000),
      ),
    ).toBeTruthy();
  });

  it("requires restart for a changed port and refuses the replaced process boot", async () => {
    await fresh();
    server = (
      await (
        await management()
      ).update(server.serverID, {
        expectedRevision: server.desiredRevision,
        displayName: server.displayName,
        configuration: { ...config, port: config.port + 1 },
      })
    ).server;
    await apply();
    expect(server.observed.status).toBe("restart_required");
    await expect(
      runtime.runtime.authorize(process.env.REALIZE_MCP_CONTROL_FIXTURE!),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    server = (
      await (
        await management()
      ).update(server.serverID, {
        expectedRevision: server.desiredRevision,
        displayName: server.displayName,
        configuration: config,
      })
    ).server;
    const replacement = new McpRuntime(
      payload,
      server.serverID,
      readMcpHostProfiles()[0],
      config.port,
    );
    await replacement.start();
    await expect(runtime.runtime.refresh()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await runtime.runtime.stop();
    expect((await fresh()).observed.status).toBe("applied");
    await replacement.stop();
    expect((await fresh()).observed.status).toBe("unknown");
  });

  it("refuses managed authorization after its real database pool is closed", async () => {
    const isolatedPayload = await openMcpPayload();
    const isolated = await createManagedMcpRuntime(isolatedPayload, {
      ...process.env,
      REALIZE_MCP_CONFIGURATION_MODE: "managed",
      REALIZE_MCP_SERVER_ID: server.serverID,
      REALIZE_MCP_HOST_PROFILE_ID: "fixture",
    });
    try {
      await isolated.start();
      expect(
        (
          await isolated.options.authorize(
            process.env.REALIZE_MCP_CONTROL_FIXTURE!,
          )
        ).discoveryOnly,
      ).toBe(true);
      await isolatedPayload.db.pool.end();
      await expect(
        isolated.options.authorize(process.env.REALIZE_MCP_CONTROL_FIXTURE!),
      ).rejects.toMatchObject({
        code: "DEPENDENCY_UNAVAILABLE",
        httpStatus: 503,
      });
    } finally {
      await isolated.options.close?.();
      await isolatedPayload.destroy().catch(() => undefined);
    }
  });
});
