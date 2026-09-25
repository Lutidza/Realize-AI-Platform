/**
 * @file tests/int/mcp-chatgpt-supervisor.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет реальный child lifecycle, private health, смену ключа и остановку без OpenAI network.
 */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { McpChatGptSupervisor } from "../../services/internal-mcp/src/McpChatGptSupervisor.service";
import type { McpChatGptLaunchPlan } from "../../packages/payload-ai-plugin/src/integrations/mcp/McpChatGptRuntime.types";

describe("managed ChatGPT tunnel child", () => {
  let root: string;
  let plan: McpChatGptLaunchPlan;
  let supervisor: McpChatGptSupervisor;
  const read = vi.fn(async () => plan);
  const report = vi.fn(async () => undefined);
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const proof = async () =>
    JSON.parse(await readFile(join(root, "proof.json"), "utf8"));

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-chatgpt-supervisor-test-"));
    const executable = join(root, "tunnel-fixture.cjs");
    await writeFile(
      executable,
      `#!${process.execPath}\nconst http=require('node:http');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=${JSON.stringify(root)};const args=process.argv.slice(2);const hash=(v)=>crypto.createHash('sha256').update(v).digest('hex');
fs.writeFileSync(path.join(root,'proof.json'),JSON.stringify({pid:process.pid,args,keyHash:hash(process.env.CONTROL_PLANE_API_KEY),tokenHash:hash(process.env.REALIZE_MCP_TUNNEL_AUTHORIZATION),inherited:Object.hasOwn(process.env,'OPENAI_API_KEY')}));
http.createServer((req,res)=>{res.statusCode=fs.existsSync(path.join(root,'ready'))?200:503;res.end('health');}).listen(args[args.indexOf('--health.unix-socket')+1]);\n`,
      { mode: 0o700 },
    );
    process.env.OPENAI_API_KEY = "unrelated-must-not-reach-child";
    plan = {
      revision: 4,
      status: "starting",
      connection: {
        executable,
        tunnelID: "tunnel_testabcdefgh",
        port: 4320,
        apiKey: `sk-fixture-${randomBytes(32).toString("hex")}`,
        mcpToken: `mcp.${randomUUID()}.${randomBytes(32).toString("base64url")}`,
      },
    };
    supervisor = new McpChatGptSupervisor({ read, report });
  });
  afterAll(async () => {
    await supervisor?.stop();
    delete process.env.OPENAI_API_KEY;
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("keeps secrets out of argv and inherited env; requires actual readiness", async () => {
    await supervisor.refresh();
    await vi.waitFor(async () =>
      expect((await proof()).pid).toBeGreaterThan(0),
    );
    const evidence = await proof();
    expect(evidence.args.join(" ")).not.toContain(plan.connection!.apiKey);
    expect(evidence.args.join(" ")).not.toContain(plan.connection!.mcpToken);
    expect(evidence.args).toContain(
      "url=http://127.0.0.1:4320/mcp,channel=main",
    );
    expect(evidence.keyHash).toBe(digest(plan.connection!.apiKey));
    expect(evidence.tokenHash).toBe(
      digest(`Bearer ${plan.connection!.mcpToken}`),
    );
    expect(evidence.inherited).toBe(false);
    await supervisor.refresh();
    expect(report).toHaveBeenLastCalledWith(4, "starting");
    await writeFile(join(root, "ready"), "ready");
    await supervisor.refresh();
    expect(report).toHaveBeenLastCalledWith(4, "connected");
  });

  it("replaces the child on a new credential revision and stops on revocation", async () => {
    const previous = await proof();
    plan = {
      ...plan,
      revision: 5,
      connection: {
        ...plan.connection!,
        apiKey: `sk-fixture-${randomBytes(32).toString("hex")}`,
      },
    };
    await supervisor.refresh();
    await vi.waitFor(async () =>
      expect((await proof()).pid).not.toBe(previous.pid),
    );
    expect(() => process.kill(previous.pid, 0)).toThrow();
    expect((await proof()).keyHash).toBe(digest(plan.connection!.apiKey));
    const active = await proof();
    plan = { revision: 6, status: "disabled" };
    await supervisor.refresh();
    expect(report).toHaveBeenLastCalledWith(6, "disabled");
    expect(() => process.kill(active.pid, 0)).toThrow();
    await expect(
      readFile(active.args[active.args.indexOf("--health.unix-socket") + 1]),
    ).rejects.toBeDefined();
  });

  it("kills an active child when configuration reads fail", async () => {
    plan = {
      revision: 7,
      status: "starting",
      connection: {
        executable: join(root, "tunnel-fixture.cjs"),
        tunnelID: "tunnel_testabcdefgh",
        port: 4320,
        apiKey: `sk-fixture-${randomBytes(32).toString("hex")}`,
        mcpToken: `mcp.${randomUUID()}.${randomBytes(32).toString("base64url")}`,
      },
    };
    const previous = (await proof()).pid;
    await supervisor.refresh();
    await vi.waitFor(async () =>
      expect((await proof()).pid).not.toBe(previous),
    );
    const active = await proof();
    read.mockRejectedValueOnce(new Error("database unavailable"));
    await supervisor.refresh();
    expect(() => process.kill(active.pid, 0)).toThrow();
  });
});
