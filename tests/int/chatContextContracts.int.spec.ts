// @vitest-environment node
/**
 * @file tests/int/chatContextContracts.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет полный контекст запроса, безопасный каталог и сохранение источников.
 */
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseCreateMessageInput,
  normalizeChatAttachmentMime,
  parseChatSources,
} from "@realize/ai-contracts";
import { collectProjectContext } from "../../services/ai-control-plane/src/projectContextCatalog.service";
import { matchProjectFiles } from "../../services/ai-control-plane/src/matchProjectFiles.validator";
import { readControlPlaneJSON } from "../../services/ai-control-plane/src/readControlPlaneJSON.service";
import { RunStore } from "../../services/ai-control-plane/src/runStore";
import { toMessageDTO } from "../../packages/payload-ai-plugin/src/endpoints/mappers";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
describe("chat context contracts", () => {
  it("accepts image-only context but rejects empty and unknown capability requests", () => {
    expect(
      parseCreateMessageInput({
        content: "",
        attachmentIDs: ["1"],
        webSearch: true,
      }),
    ).toMatchObject({ attachmentIDs: ["1"], webSearch: true });
    expect(() => parseCreateMessageInput({ content: "" })).toThrow();
    expect(() =>
      parseCreateMessageInput({ content: "text", tools: { mcp: true } }),
    ).toThrow();
    expect(() =>
      parseCreateMessageInput({ content: "text", attachmentIDs: ["1", "1"] }),
    ).toThrow();
  });
  it("normalizes text extension without trusting browser MIME and rejects PDF/SVG", () => {
    expect(normalizeChatAttachmentMime("config.ts")).toBe("text/typescript");
    expect(() => normalizeChatAttachmentMime("report.pdf")).toThrow();
    expect(() => normalizeChatAttachmentMime("vector.svg")).toThrow();
  });
  it("excludes mutable agent state and secrets, filters query and revalidates selected hashes", async () => {
    const root = await mkdtemp(join(tmpdir(), "chat-catalog-test-"));
    roots.push(root);
    await mkdir(join(root, "src"));
    await mkdir(join(root, ".ai/tools/agent-runtime/runtime"), {
      recursive: true,
    });
    await writeFile(join(root, "src/one.ts"), "export const one=1;");
    await writeFile(join(root, "src/two.ts"), "export const two=2;");
    await writeFile(join(root, "src/.env"), "SECRET=private");
    await writeFile(
      join(root, ".ai/tools/agent-runtime/runtime/private.json"),
      "{}",
    );
    const entries = await collectProjectContext(root, {
      query: "one",
      limit: 1,
    });
    expect(entries.map((entry) => entry.file.path)).toEqual(["src/one.ts"]);
    const all = await collectProjectContext(root);
    expect(all).toHaveLength(2);
    expect(matchProjectFiles(all, [entries[0].file])).toEqual([
      entries[0].file,
    ]);
    await writeFile(join(root, "src/one.ts"), "changed");
    expect(() => matchProjectFiles([], [entries[0].file])).toThrow();
  });
  it("accepts UTF-8 message and maximum project metadata within a fixed JSON byte limit", async () => {
    const input = {
      prompt: "😀".repeat(4000),
      projectFiles: Array.from({ length: 10 }, (_, i) => ({
        path: `src/${i}-${"a".repeat(480)}.ts`,
        sha256: "a".repeat(64),
      })),
    };
    const request = Readable.from([
      Buffer.from(JSON.stringify(input)),
    ]) as IncomingMessage;
    await expect(readControlPlaneJSON(request)).resolves.toEqual(input);
    await expect(
      readControlPlaneJSON(
        Readable.from([Buffer.alloc(49 * 1024, 32)]) as IncomingMessage,
      ),
    ).rejects.toThrow("too large");
  });
  it("binds control-plane run ID to the entire original request", () => {
    const store = new RunStore();
    const input = { id: "1", prompt: "text", webSearch: false };
    store.create(input);
    expect(() => store.create({ ...input, webSearch: true })).toThrow(
      "different request",
    );
    expect(store.create(input).id).toBe("1");
  });
  it("maps old history defaults and accepts only actual safe source records", () => {
    expect(
      toMessageDTO({ id: 1, content: "hello", role: "assistant" }),
    ).toMatchObject({
      attachments: [],
      projectFiles: [],
      webSearch: false,
      sources: [],
    });
    expect(
      parseChatSources([
        { url: "https://docs.example/test", title: "Docs" },
        { url: "javascript:alert(1)" },
        { url: "https://docs.example/\nsecret" },
      ]),
    ).toEqual([{ url: "https://docs.example/test", title: "Docs" }]);
    expect(
      toMessageDTO({
        id: 1,
        content: "answer",
        role: "assistant",
        sources: [{ url: "https://docs.example/test" }],
      }).sources,
    ).toHaveLength(1);
  });
});
