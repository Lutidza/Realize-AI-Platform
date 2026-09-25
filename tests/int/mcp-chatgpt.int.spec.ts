/**
 * @file tests/int/mcp-chatgpt.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет изоляцию ключей ChatGPT, CAS, grants и отзыв на настоящем Payload/PostgreSQL.
 */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createLocalReq, type Payload, type PayloadRequest } from "payload";
import {
  MCP_DEFAULT_LIMITS,
  MCP_REALIZE_TOOLS,
  type McpServerDetailDto,
  type SaveMcpChatGptInput,
} from "@realize/ai-contracts";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";
import { McpManagement } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpManagement.service";
import { McpChatGpt } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpChatGpt.service";
import { McpChatGptCredentials } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpChatGptCredentials.service";
import { McpChatGptRuntime } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpChatGptRuntime.service";
import { McpRuntime } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpRuntime.service";
import { McpClients } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpClients.service";
import { readMcpHostProfiles } from "../../packages/payload-ai-plugin/src/integrations/mcp/readMcpHostProfiles.config";
import { mcpManagementInputs } from "../../packages/ai-contracts/src/mcpManagementInputs.config";

describe.skipIf(!process.env.MCP_TEST_DATABASE_URI)(
  "ChatGPT credentials in Admin registry",
  () => {
    let payload: Payload;
    let actor: NonNullable<PayloadRequest["user"]>;
    let first: McpServerDetailDto;
    let second: McpServerDetailDto;
    let runtime: McpRuntime;
    let connector: McpChatGptRuntime;
    let keys: McpChatGptCredentials;
    let oldToken: string;
    const apiKey = `sk-fixture-${randomBytes(32).toString("base64url")}`;
    const management = async (requestKey = randomUUID()) =>
      new McpManagement({
        req: await createLocalReq({ user: actor }, payload),
        actor,
        requestKey,
      });
    const fresh = async () =>
      (first = await (await management()).detail(first.serverID));
    const input = async (): Promise<SaveMcpChatGptInput> => ({
      expectedRevision: (await fresh()).desiredRevision,
      tunnelID: `tunnel_${randomUUID().replaceAll("-", "")}`,
      apiKey,
      grants: { repositoryRead: false, pagesRead: true },
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    beforeAll(async () => {
      const database = new URL(process.env.MCP_TEST_DATABASE_URI!);
      if (
        database.hostname !== "127.0.0.1" ||
        !/^realize_mcp_fixture(?:_[a-z0-9]+)?$/.test(
          database.pathname.slice(1),
        ) ||
        process.env.DATABASE_URI !== database.href
      )
        throw new Error("ISOLATED_MCP_DATABASE_REQUIRED");
      process.env.REALIZE_INTEGRATIONS_ENCRYPTION_KEY =
        randomBytes(32).toString("base64");
      process.env.REALIZE_MCP_CONTROL_CHATGPT_FIXTURE =
        randomBytes(32).toString("base64url");
      process.env.REALIZE_MCP_HOST_PROFILES = JSON.stringify([
        {
          id: "chatgpt-fixture",
          label: "Изолированный ChatGPT",
          allowedPorts: [3345],
          pagesRead: true,
          controlTokenEnv: "REALIZE_MCP_CONTROL_CHATGPT_FIXTURE",
          maximumLimits: MCP_DEFAULT_LIMITS,
          tunnelClientPath: "/usr/bin/false",
        },
      ]);
      payload = await openMcpPayload();
      const user = await payload.create({
        collection: "users",
        overrideAccess: true,
        data: {
          email: `chatgpt-${randomUUID()}@example.invalid`,
          password: randomBytes(32).toString("base64url"),
          name: "ChatGPT fixture",
          roles: ["admin"],
        },
      });
      actor = { ...user, collection: "users" };
      const create = async () =>
        (
          await (
            await management()
          ).create({
            displayName: "ChatGPT fixture",
            configuration: {
              schemaVersion: "1.0",
              adapterVersion: "1.0",
              serverType: "realize-internal",
              direction: "hosted_endpoint",
              managementSource: "admin_managed",
              environment: "fixture",
              hostProfileID: "chatgpt-fixture",
              port: 3345,
              allowedTools: [...MCP_REALIZE_TOOLS],
              limits: { ...MCP_DEFAULT_LIMITS },
            },
          })
        ).server;
      first = await create();
      second = await create();
      runtime = new McpRuntime(
        payload,
        first.serverID,
        readMcpHostProfiles()[0],
        3345,
      );
      connector = new McpChatGptRuntime(payload, runtime);
      keys = new McpChatGptCredentials(payload);
      await runtime.start();
    }, 60000);
    afterAll(async () => {
      await runtime?.stop();
      await payload?.destroy();
    });

    it("requires an enabled instance and explicit grants, preserving revision on failure", async () => {
      const command = await input();
      expect(first.chatgpt?.hasApiKey).toBe(false);
      await expect(
        new McpChatGpt(await management()).save(first.serverID, command),
      ).rejects.toMatchObject({ status: 400 });
      first = (
        await (
          await management()
        ).enabled(first.serverID, {
          expectedRevision: first.desiredRevision,
          enabled: true,
        })
      ).server;
      await expect(
        new McpChatGpt(await management()).save(first.serverID, {
          ...command,
          expectedRevision: first.desiredRevision,
          grants: { repositoryRead: true, pagesRead: false },
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect((await fresh()).hasCredential).toBe(false);
    });

    it("encrypts keys per instance and returns neither key nor verifier in DTO/audit", async () => {
      const command = await input();
      const requestKey = randomUUID();
      const managementA = await management(requestKey);
      first = (await new McpChatGpt(managementA).save(first.serverID, command))
        .server;
      const record = await managementA.repository.server(first.serverID);
      oldToken = keys.read(record)!.mcpToken;
      expect(keys.read(record)!.apiKey).toBe(apiKey);
      expect(String(record.credentialEnvelope)).not.toContain(apiKey);
      expect(String(record.credentialEnvelope)).not.toContain(oldToken);
      expect(first.chatgpt?.hasApiKey).toBe(true);
      expect(first.chatgpt?.status).toBe("pending");
      expect((await connector.read()).connection).toBeUndefined();
      const events = await managementA.repository.events(first.serverID, 1);
      const safe = JSON.stringify({ first, events });
      expect(safe).not.toContain(apiKey);
      expect(safe).not.toContain(oldToken);
      expect(safe).not.toContain("verifier");
      const secondRecord = await managementA.repository.server(second.serverID);
      expect(keys.read(secondRecord)).toBeNull();
      expect(() =>
        keys.read({
          ...secondRecord,
          credentialEnvelope: record.credentialEnvelope,
        }),
      ).toThrow();
      const replay = await new McpChatGpt(await management(requestKey)).save(
        first.serverID,
        command,
      );
      expect(replay.replayed).toBe(true);
      expect(replay.server.desiredRevision).toBe(first.desiredRevision);
      await expect(
        new McpChatGpt(await management(requestKey)).save(first.serverID, {
          ...command,
          apiKey: `${apiKey}x`,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await runtime.refresh();
      const plan = await connector.read();
      expect(plan.connection?.apiKey).toBe(apiKey);
      expect(plan.connection?.mcpToken).toBe(oldToken);
      expect(plan.connection?.tunnelID).toBe(command.tunnelID);
      expect(await runtime.authorize(oldToken)).toMatchObject({
        payloadUserID: String(actor.id),
      });
    });

    it("preserves an omitted key, rotates only the connector key and rejects stale writes", async () => {
      const command = await input();
      delete command.apiKey;
      const beforeClient = first.chatgpt!.clientID;
      const result = await new McpChatGpt(await management()).save(
        first.serverID,
        command,
      );
      first = result.server;
      expect(first.chatgpt!.clientID).toBe(beforeClient);
      expect(first.clients).toHaveLength(1);
      const record = await (
        await management()
      ).repository.server(first.serverID);
      expect(keys.read(record)!.apiKey).toBe(apiKey);
      expect(keys.read(record)!.mcpToken).not.toBe(oldToken);
      await expect(runtime.authorize(oldToken)).rejects.toBeDefined();
      await expect(
        new McpChatGpt(await management()).save(first.serverID, command),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        new McpClients(await management()).rotate(
          first.serverID,
          beforeClient!,
          first.desiredRevision,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await runtime.refresh();
      expect((await connector.read()).connection?.mcpToken).toBe(
        keys.read(record)!.mcpToken,
      );
    });

    it("preserves the connector across normal form saves and refuses forged client bindings", async () => {
      await fresh();
      if (first.configuration.serverType !== "realize-internal")
        throw new Error("hosted expected");
      const binding = first.configuration.chatgptTunnel;
      const result = await (
        await management()
      ).update(first.serverID, {
        displayName: "Updated ChatGPT fixture",
        expectedRevision: first.desiredRevision,
        configuration: {
          ...first.configuration,
          chatgptTunnel: {
            tunnelID: "tunnel_wrongwrong",
            clientID: randomUUID(),
          },
        },
      });
      first = result.server;
      expect(
        first.configuration.serverType === "realize-internal" &&
          first.configuration.chatgptTunnel,
      ).toEqual(binding);
      expect((await connector.read()).status).toBe("pending");
      await (await management()).apply(first.serverID, first.desiredRevision);
      await runtime.refresh();
      expect((await connector.read()).connection).toBeDefined();
    });

    it("ties readiness to current revision/boot and expires old observations", async () => {
      await connector.report(first.desiredRevision, "connected");
      expect((await fresh()).chatgpt?.status).toBe("connected");
      const m = await management();
      await m.repository.saveReceipt(first.serverID, {
        chatgptTunnel: {
          revision: first.desiredRevision,
          status: "connected",
          observedAt: new Date(Date.now() - 31000).toISOString(),
        },
      });
      expect((await fresh()).chatgpt?.status).toBe("stale");
      await connector.report(first.desiredRevision - 1, "connected");
      expect((await fresh()).chatgpt?.status).toBe("stale");
      const replacement = new McpRuntime(
        payload,
        first.serverID,
        readMcpHostProfiles()[0],
        3345,
      );
      await replacement.start();
      await connector.report(first.desiredRevision, "connected");
      expect((await fresh()).chatgpt?.status).toBe("pending");
      expect((await connector.read()).connection).toBeUndefined();
      runtime = replacement;
      connector = new McpChatGptRuntime(payload, runtime);
    });

    it("stops on disable/revoke and disconnects without decrypting or using env fallback", async () => {
      first = (
        await (
          await management()
        ).enabled(first.serverID, {
          expectedRevision: first.desiredRevision,
          enabled: false,
        })
      ).server;
      expect((await connector.read()).status).toBe("disabled");
      first = (
        await (
          await management()
        ).enabled(first.serverID, {
          expectedRevision: first.desiredRevision,
          enabled: true,
        })
      ).server;
      await (await management()).apply(first.serverID, first.desiredRevision);
      await runtime.refresh();
      const token = (await connector.read()).connection!.mcpToken;
      const clientID = first.chatgpt!.clientID!;
      first = (
        await new McpClients(await management()).revoke(
          first.serverID,
          clientID,
          first.desiredRevision,
        )
      ).server;
      await runtime.refresh(true);
      expect((await connector.read()).status).toBe("failed");
      await expect(runtime.authorize(token)).rejects.toBeDefined();
      delete process.env.REALIZE_INTEGRATIONS_ENCRYPTION_KEY;
      process.env.CONTROL_PLANE_API_KEY = apiKey;
      first = (
        await new McpChatGpt(await management()).disconnect(
          first.serverID,
          first.desiredRevision,
        )
      ).server;
      expect(first.chatgpt?.status).toBe("not_configured");
      expect(first.hasCredential).toBe(false);
      expect((await connector.read()).connection).toBeUndefined();
      const saved = await (
        await management()
      ).repository.server(first.serverID);
      expect(saved.credentialEnvelope).toBeNull();
      delete process.env.CONTROL_PLANE_API_KEY;
    });
  },
);

describe("ChatGPT boundary input", () => {
  it("rejects commands, arbitrary destinations, malformed secrets and client IDs", () => {
    const valid = {
      expectedRevision: 1,
      tunnelID: "tunnel_abcdefgh",
      apiKey: `sk-fixture-${randomBytes(20).toString("hex")}`,
      grants: { repositoryRead: true, pagesRead: false },
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    expect(mcpManagementInputs.chatgpt.safeParse(valid).success).toBe(true);
    for (const extra of [
      { command: "sh" },
      { endpoint: "http://external.invalid" },
      { clientID: randomUUID() },
      { apiKey: "bad\nsecret" },
      { tunnelID: "tunnel_../../secret" },
    ])
      expect(
        mcpManagementInputs.chatgpt.safeParse({ ...valid, ...extra }).success,
      ).toBe(false);
  });
});
