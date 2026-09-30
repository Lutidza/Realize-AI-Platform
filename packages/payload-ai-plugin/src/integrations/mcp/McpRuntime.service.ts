/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/McpRuntime.service.ts
 * @version 1.2.0
 * @date 2026-09-26
 * @description Применяет managed snapshots и проверяет свежие grants перед каждым MCP dispatch.
 */
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createLocalReq, type Payload, type PayloadRequest } from "payload";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { McpLimits } from "../../../../ai-contracts/src/McpServer.types";
import type { McpToolName } from "../../../../ai-contracts/src/McpTool.types";
import type { McpHostProfile } from "./McpHostProfile.types";
import type { McpAppliedSnapshot } from "./McpPersistence.types";
import { EndpointError } from "../../endpoints/http";
import { relationID } from "../../endpoints/mappers";
import { McpRepository } from "./Mcp.repository";
import { readMcpActor } from "./readMcpActor.service";
import { readRuntimeActor } from "../../runtime/readRuntimeActor.service";
import {
  readMcpConfiguration,
  validateMcpConfiguration,
} from "./validateMcpConfiguration.validator";
import { withMcpTransaction } from "./withMcpTransaction.service";

/** Эта identity приходит из operator launcher; ни browser, ни tool input её не назначают. */
export class McpRuntime {
  readonly bootID = randomUUID();
  constructor(
    private readonly payload: Payload,
    readonly serverID: string,
    readonly profile: McpHostProfile,
    readonly port: number,
  ) {}
  private async request(): Promise<PayloadRequest> {
    return createLocalReq({}, this.payload);
  }
  private denied(message = "Доступ MCP не разрешён."): EndpointError {
    return new EndpointError("FORBIDDEN", message, 403);
  }

  async start(): Promise<void> {
    const req = await this.request();
    await withMcpTransaction(req, this.serverID, async () => {
      const repository = new McpRepository(req);
      await repository.server(this.serverID);
      await repository.saveReceipt(this.serverID, {
        bootID: this.bootID,
        hostProfileID: this.profile.id,
        serviceIdentity: `mcp-host:${this.profile.id}`,
        status: "applying",
        appliedSnapshot: null,
        chatgptTunnel: null,
        appliedRevision: null,
        configHash: null,
        observedAt: new Date().toISOString(),
      });
    });
    await this.refresh(true);
  }

  async refresh(initial = false): Promise<void> {
    const req = await this.request();
    await withMcpTransaction(req, this.serverID, async () => {
      const repository = new McpRepository(req);
      const server = await repository.server(this.serverID);
      const receipt = await repository.receipt(this.serverID);
      if (
        receipt?.bootID !== this.bootID ||
        receipt.hostProfileID !== this.profile.id
      )
        throw this.denied("Процесс заменён другим запуском.");
      const observedAt = new Date().toISOString();
      const configuration = readMcpConfiguration(server.configuration);
      if (
        configuration.serverType !== "realize-internal" ||
        configuration.hostProfileID !== this.profile.id
      )
        throw this.denied();
      validateMcpConfiguration(configuration);
      if (configuration.port !== this.port) {
        await repository.saveReceipt(this.serverID, {
          status: "restart_required",
          observedAt,
          reason: "Port изменён. Оператор должен перезапустить этот экземпляр.",
        });
        return;
      }
      if (
        initial ||
        (receipt.requestedRevision === server.revision &&
          receipt.appliedRevision !== server.revision)
      ) {
        const clients = (await repository.clients(this.serverID)).filter(
          (client) =>
            !client.revokedAt &&
            Date.parse(String(client.expiresAt)) > Date.now(),
        );
        const snapshot: McpAppliedSnapshot = {
          serverID: this.serverID,
          revision: Number(server.revision),
          enabled: server.enabled === true,
          configuration,
          clients: clients.map((client) => {
            const grants = client.grants as {
              repositoryRead: boolean;
              pagesRead: boolean;
              workshopRead?: boolean;
              workshopWrite?: boolean;
              workshopPreview?: boolean;
            };
            return {
              clientID: String(client.clientID),
              revision: Number(client.revision),
              grants: {
                repositoryRead:
                  grants.repositoryRead === true &&
                  this.profile.repositoryServerIDs.includes(this.serverID) &&
                  !!this.profile.repositoryRoot,
                pagesRead: grants.pagesRead === true && this.profile.pagesRead,
                workshopRead:
                  grants.workshopRead === true &&
                  this.profile.workshop === true,
                workshopWrite:
                  grants.workshopWrite === true &&
                  grants.workshopRead === true &&
                  this.profile.workshop === true,
                workshopPreview:
                  grants.workshopPreview === true &&
                  grants.workshopRead === true &&
                  this.profile.workshop === true,
              },
              actorID: relationID(client.actor) || null,
            };
          }),
        };
        // Receipt связан с текущим boot/revision; поздний writer не может подтвердить новую конфигурацию.
        await repository.saveReceipt(this.serverID, {
          appliedRevision: snapshot.revision,
          configHash: hashCanonicalJSON(snapshot),
          appliedSnapshot: snapshot,
          status: "applied",
          observedAt,
          reason: null,
        });
      } else await repository.saveReceipt(this.serverID, { observedAt });
    });
  }

  /** Старый процесс не изменяет receipt нового boot при своём завершении. */
  async stop(): Promise<void> {
    const req = await this.request();
    await withMcpTransaction(req, this.serverID, async () => {
      const repository = new McpRepository(req);
      if ((await repository.receipt(this.serverID))?.bootID !== this.bootID)
        return;
      await repository.saveReceipt(this.serverID, {
        status: "unknown",
        observedAt: new Date().toISOString(),
        reason: "Процесс MCP остановлен.",
        chatgptTunnel: null,
      });
    });
  }

  async authorize(credential: string) {
    const req = await this.request();
    return withMcpTransaction(req, this.serverID, async () => {
      const repository = new McpRepository(req);
      const server = await repository.server(this.serverID);
      const configuration = readMcpConfiguration(server.configuration);
      if (
        configuration.serverType !== "realize-internal" ||
        configuration.hostProfileID !== this.profile.id ||
        configuration.port !== this.port
      )
        throw this.denied("Конфигурация требует применения или перезапуска.");
      validateMcpConfiguration(configuration);
      const receipt = await repository.receipt(this.serverID);
      if (
        !receipt ||
        receipt.bootID !== this.bootID ||
        receipt.hostProfileID !== this.profile.id
      )
        throw this.denied();
      const digest = (value: string) =>
        createHash("sha256").update(value).digest();
      const control = process.env[this.profile.controlTokenEnv];
      if (control && timingSafeEqual(digest(control), digest(credential))) {
        return {
          principalID: `probe:${this.serverID}`,
          installationID: "single",
          repositoryRead:
            !!this.profile.repositoryRoot &&
            this.profile.repositoryServerIDs.includes(this.serverID),
          pagesRead: this.profile.pagesRead,
          workshopRead: this.profile.workshop === true,
          workshopWrite: this.profile.workshop === true,
          workshopPreview: this.profile.workshop === true,
          allowedTools: configuration.allowedTools as McpToolName[],
          limits: configuration.limits,
          discoveryOnly: true,
        };
      }
      if (!server.enabled) throw this.denied("MCP-сервер отключён.");
      const match = /^mcp\.([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(
        credential,
      );
      if (!match)
        throw new EndpointError(
          "UNAUTHENTICATED",
          "Credential недействителен.",
          401,
        );
      const client = await repository
        .client(this.serverID, match[1])
        .catch((error: unknown) => {
          if (error instanceof EndpointError && error.code === "NOT_FOUND")
            throw new EndpointError(
              "UNAUTHENTICATED",
              "Ключ отозван или недействителен.",
              401,
            );
          throw error;
        });
      const verifier =
        typeof client.verifier === "string"
          ? Buffer.from(client.verifier, "hex")
          : Buffer.alloc(0);
      if (
        verifier.length !== 32 ||
        !timingSafeEqual(verifier, digest(credential)) ||
        client.revokedAt ||
        Date.parse(String(client.expiresAt)) <= Date.now()
      )
        throw new EndpointError(
          "UNAUTHENTICATED",
          "Ключ отозван или недействителен.",
          401,
        );
      const applied = receipt.appliedSnapshot as McpAppliedSnapshot | null;
      if (
        !applied ||
        receipt.configHash !== hashCanonicalJSON(applied) ||
        applied.serverID !== this.serverID ||
        !applied.enabled ||
        applied.configuration.port !== this.port ||
        applied.configuration.hostProfileID !== this.profile.id
      )
        throw this.denied("Конфигурация ещё не применена.");
      const accepted = applied.clients.find(
        (entry) =>
          entry.clientID === client.clientID &&
          entry.revision === client.revision,
      );
      if (!accepted) throw this.denied("Доступ клиента ожидает применения.");
      const grants = client.grants as {
        repositoryRead: boolean;
        pagesRead: boolean;
        workshopRead?: boolean;
        workshopWrite?: boolean;
        workshopPreview?: boolean;
      };
      const actorID = relationID(client.actor);
      if (accepted.actorID !== (actorID || null)) throw this.denied();
      if (actorID) {
        if (grants.workshopRead === true && !grants.pagesRead)
          await readRuntimeActor(this.payload, actorID);
        else await readMcpActor(this.payload, actorID);
      }
      const limits = Object.fromEntries(
        Object.entries(configuration.limits).map(([key, value]) => [
          key,
          Math.min(
            value,
            applied.configuration.limits[key as keyof McpLimits],
            this.profile.maximumLimits[key as keyof McpLimits],
          ),
        ]),
      ) as McpLimits;
      return {
        principalID: String(client.principalID),
        installationID: "single",
        repositoryRead:
          grants.repositoryRead === true &&
          accepted.grants.repositoryRead &&
          this.profile.repositoryServerIDs.includes(this.serverID) &&
          !!this.profile.repositoryRoot,
        pagesRead:
          grants.pagesRead === true &&
          accepted.grants.pagesRead &&
          this.profile.pagesRead &&
          !!actorID,
        workshopRead:
          grants.workshopRead === true &&
          accepted.grants.workshopRead === true &&
          this.profile.workshop === true &&
          !!actorID,
        workshopWrite:
          grants.workshopRead === true &&
          accepted.grants.workshopRead === true &&
          grants.workshopWrite === true &&
          accepted.grants.workshopWrite === true &&
          this.profile.workshop === true &&
          !!actorID,
        workshopPreview:
          grants.workshopRead === true &&
          accepted.grants.workshopRead === true &&
          grants.workshopPreview === true &&
          accepted.grants.workshopPreview === true &&
          this.profile.workshop === true &&
          !!actorID,
        workshopIdentity: {
          serverID: this.serverID,
          clientID: String(client.clientID),
          clientRevision: Number(client.revision),
        },
        ...(actorID ? { payloadUserID: actorID } : {}),
        allowedTools: configuration.allowedTools.filter((name) =>
          applied.configuration.allowedTools.includes(name),
        ) as McpToolName[],
        limits,
      };
    });
  }
}
