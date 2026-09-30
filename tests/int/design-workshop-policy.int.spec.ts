/**
 * @file tests/int/design-workshop-policy.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-30
 * @description Проверяет границы недоверенных файлов, deterministic snapshots и bounded HTTP body.
 * @see documentation/specifications/design-workshop.md
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { describe, expect, it } from "vitest";
import {
  DESIGN_WORKSHOP_LIMITS as limits,
  designWorkshopCommands,
  type PrepareDesignChangeInput,
} from "@realize/ai-contracts";
import {
  normalizeDesignSnapshot,
  prepareDesignSnapshot,
  hashCanonicalJSON,
} from "@realize/change-engine";
import { readBoundedJsonBody } from "../../packages/payload-ai-plugin/src/endpoints/readBoundedJsonBody.adapter";
import { readMcpBody } from "../../packages/payload-ai-plugin/src/integrations/mcp/readMcpBody.adapter";
import { designProjectFixture } from "./designWorkshop.fixture";

const edit = (): PrepareDesignChangeInput => ({
  baseRevisionId: randomUUID(),
  summary: "Изменить отступы",
  operations: [
    { kind: "put", path: "src/task.css", content: "main { padding: 24px; }\n" },
  ],
});

describe("Design Workshop contracts and policy", () => {
  it.each([
    "../secret.ts",
    "/src/a.tsx",
    "src/../a.ts",
    "src//a.ts",
    "src/./a.ts",
    "src\\a.ts",
    "src/%2e%2e/a.ts",
    "src/.env.json",
    "src/.ai/rule.md",
    "src/node_modules/a.ts",
    "src/migrations/a.ts",
    "src/generated/a.ts",
    "src/AGENTS.md",
    "src/package.json",
    "src/secrets.json",
    "src/next.config.ts",
    "src/payload-types.ts",
    "public/key.pem",
    "src/a.ts\0",
    "src/CREDENTIALS/a.json",
  ])("rejects unsafe draft path %s", (path) => {
    const input = designProjectFixture();
    input.snapshot.files[0].path = path;
    expect(designWorkshopCommands.create.safeParse(input).success).toBe(false);
  });

  it("pins canonical identity regardless of file order and retains source order", () => {
    const a = designProjectFixture().snapshot;
    const b = structuredClone(a);
    b.files.reverse();
    expect(hashCanonicalJSON(normalizeDesignSnapshot(a))).toBe(
      hashCanonicalJSON(normalizeDesignSnapshot(b)),
    );
  });

  it("measures UTF-8 bytes, aggregate size and case-insensitive path uniqueness", () => {
    const input = designProjectFixture();
    input.snapshot.files[0].content = "я".repeat(limits.fileBytes / 2);
    expect(designWorkshopCommands.create.safeParse(input).success).toBe(true);
    input.snapshot.files[0].content += "я";
    expect(designWorkshopCommands.create.safeParse(input).success).toBe(false);
    input.snapshot.files = Array.from({ length: 9 }, (_, i) => ({
      path: `src/f${i}.css`,
      content: "x".repeat(limits.fileBytes),
    }));
    expect(designWorkshopCommands.create.safeParse(input).success).toBe(false);
    input.snapshot.files = [
      { path: "src/A.css", content: "" },
      { path: "src/a.css", content: "" },
    ];
    expect(designWorkshopCommands.create.safeParse(input).success).toBe(false);
  });

  it("does not accept client identity, absolute bindings, approval flags or credential URLs", () => {
    for (const extra of [
      { actorId: "admin" },
      { workspaceBindingId: "/tmp" },
      { approved: true },
      { channel: "chatgpt" },
    ])
      expect(
        designWorkshopCommands.create.safeParse({
          ...designProjectFixture(),
          ...extra,
        }).success,
      ).toBe(false);
    const input = designProjectFixture();
    const credentialURL = new URL("https://example.invalid/a");
    credentialURL.username = "fixture";
    credentialURL.password = randomUUID();
    input.snapshot.sources = [
      {
        kind: "link",
        title: "Ключ",
        url: credentialURL.href,
      },
    ];
    expect(designWorkshopCommands.create.safeParse(input).success).toBe(false);
    expect(
      designWorkshopCommands.apply.safeParse({ approved: true }).success,
    ).toBe(false);
  });

  it("rejects unsupported snapshot versions, invalid Unicode and file-directory collisions", () => {
    const input = designProjectFixture();
    expect(
      designWorkshopCommands.create.safeParse({
        ...input,
        snapshot: { ...input.snapshot, schemaVersion: "2.0" },
      }).success,
    ).toBe(false);
    input.snapshot.files[0].content = "\ud800";
    expect(designWorkshopCommands.create.safeParse(input).success).toBe(false);
    input.snapshot.files = [
      { path: "src/theme.css", content: "" },
      { path: "src/theme.css/a.ts", content: "" },
    ];
    expect(designWorkshopCommands.create.safeParse(input).success).toBe(false);
  });

  it("prepares an exact multifile candidate without changing the base", () => {
    const base = normalizeDesignSnapshot(designProjectFixture().snapshot);
    const original = structuredClone(base);
    const command = edit();
    command.operations.push(
      { kind: "delete", path: "src/TaskView.tsx" },
      {
        kind: "put",
        path: "src/Empty.tsx",
        content: "export const Empty = () => null;",
      },
    );
    const result = prepareDesignSnapshot(base, command);
    expect(base).toEqual(original);
    expect(result.snapshot.files.map((file) => file.path)).toEqual([
      "src/Empty.tsx",
      "src/task.css",
    ]);
    expect(result.diff.files.map((file) => file.kind)).toEqual([
      "added",
      "deleted",
      "modified",
    ]);
    expect(result.contentHash).toBe(hashCanonicalJSON(result.snapshot));
  });

  it("rejects missing deletes, no-op changes and duplicate operations", () => {
    const base = normalizeDesignSnapshot(designProjectFixture().snapshot);
    expect(() =>
      prepareDesignSnapshot(base, { ...edit(), operations: [] }),
    ).toThrow();
    expect(() =>
      prepareDesignSnapshot(base, {
        ...edit(),
        operations: [{ kind: "delete", path: "src/missing.ts" }],
      }),
    ).toThrow();
    expect(
      designWorkshopCommands.prepare.safeParse({
        ...edit(),
        operations: [edit().operations[0], edit().operations[0]],
      }).success,
    ).toBe(false);
  });
});

describe("bounded JSON transport", () => {
  const req = (body: string | Uint8Array, contentType = "application/json") =>
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": contentType },
      body: body as BodyInit,
    }) as unknown as PayloadRequest;

  it("accepts UTF-8 JSON and rejects malformed JSON without leaking the original", async () => {
    await expect(
      readBoundedJsonBody(req('{"text":"Макет"}'), 100),
    ).resolves.toEqual({ text: "Макет" });
    await expect(
      readBoundedJsonBody(req('{"private":"not-closed'), 100),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      readBoundedJsonBody(req(new Uint8Array([0xff, 0xfe])), 100),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("counts actual streamed bytes even with a forged length and keeps MCP at 64 KiB", async () => {
    const request = req(JSON.stringify({ content: "я".repeat(50) }));
    request.headers.set("content-length", "1");
    await expect(readBoundedJsonBody(request, 100)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(
      readMcpBody(req(JSON.stringify({ content: "x".repeat(65536) }))),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      readBoundedJsonBody(req("{}", "text/plain; application/json"), 100),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});
