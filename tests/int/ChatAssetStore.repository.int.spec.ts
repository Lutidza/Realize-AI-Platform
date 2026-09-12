// @vitest-environment node
/**
 * @file tests/int/ChatAssetStore.repository.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет приватность, форматы, неизменяемость и очистку файлов чата.
 */
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  utimes,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_PENDING_ATTACHMENT_TTL_MS,
} from "@realize/ai-contracts";
import { ChatAssetStore } from "../../services/ai-control-plane/src/ChatAssetStore.repository";
import { materializeChatAttachments } from "../../services/ai-control-plane/src/materializeChatAttachments.service";

const roots: string[] = [];
const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), "chat-assets-test-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const storage = join(root, "private");
  return {
    root,
    workspace,
    storage,
    store: new ChatAssetStore(storage, workspace),
  };
};
const chunks = async function* (data: Buffer) {
  yield data;
};
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("private chat assets", () => {
  it("requires explicit external storage and rejects symlink roots", async () => {
    const { root, workspace, storage } = await setup();
    expect(await new ChatAssetStore(undefined, workspace).available()).toBe(
      false,
    );
    expect(
      await new ChatAssetStore(join(workspace, "files"), workspace).available(),
    ).toBe(false);
    await mkdir(storage);
    await symlink(storage, join(root, "alias"));
    expect(
      await new ChatAssetStore(join(root, "alias"), workspace).available(),
    ).toBe(false);
  });
  it("streams a real image and materializes it only for the claimed run", async () => {
    const { store, workspace } = await setup();
    const data = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    const metadata = await store.upload({
      name: "image.png",
      mimeType: "image/png",
      chunks: chunks(data),
    });
    await expect(
      materializeChatAttachments(store, [metadata], "42", workspace),
    ).rejects.toThrow();
    await store.claim(metadata, "42");
    const result = await materializeChatAttachments(
      store,
      [metadata],
      "42",
      workspace,
    );
    expect(result.images).toHaveLength(1);
    expect(await readFile(result.images[0].path)).toEqual(data);
    await expect(store.remove(metadata.id)).rejects.toThrow("immutable");
    await expect(store.claim(metadata, "43")).rejects.toThrow();
  });
  it("serializes concurrent claim and delete without deleting a linked asset", async () => {
    const { store } = await setup();
    const file = await store.upload({
      name: "note.md",
      mimeType: "text/markdown",
      chunks: chunks(Buffer.from("hello")),
    });
    const results = await Promise.allSettled([
      store.claim(file, "42"),
      store.remove(file.id),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    await expect(store.claim(file, "42")).resolves.toBeUndefined();
  });
  it.each([
    ["fake.png", "image/png", Buffer.from("not an image")],
    ["binary.txt", "text/plain", Buffer.from([0xff, 0x00])],
    ["report.pdf", "application/pdf", Buffer.from("%PDF-1.4")],
    [
      "huge.txt",
      "text/plain",
      Buffer.alloc(CHAT_ATTACHMENT_LIMITS.maxTextBytes + 1, 97),
    ],
  ])(
    "rejects unsupported bytes and removes partial storage for %s",
    async (name, mimeType, data) => {
      const { store } = await setup();
      await expect(
        store.upload({ name, mimeType, chunks: chunks(data) }),
      ).rejects.toThrow();
    },
  );
  it("rejects metadata path injection and symlink metadata files", async () => {
    const { store, root, storage } = await setup();
    const asset = await store.upload({
      name: "a.txt",
      mimeType: "text/plain",
      chunks: chunks(Buffer.from("safe")),
    });
    const path = join(storage, asset.id, "metadata.json");
    await writeFile(path, JSON.stringify({ ...asset, id: "../../outside" }));
    await expect(store.read(asset.id)).rejects.toThrow("metadata");
    await rm(path);
    await writeFile(join(root, "secret"), "secret");
    await symlink(join(root, "secret"), path);
    await expect(store.read(asset.id)).rejects.toThrow();
  });
  it("expires only pending assets and explicitly deletes an expired upload", async () => {
    const { store, storage } = await setup();
    const asset = await store.upload({
      name: "a.txt",
      mimeType: "text/plain",
      chunks: chunks(Buffer.from("safe")),
    });
    const old = new Date(Date.now() - CHAT_PENDING_ATTACHMENT_TTL_MS - 1000);
    await writeFile(
      join(storage, asset.id, "metadata.json"),
      JSON.stringify({ ...asset, createdAt: old.toISOString() }),
    );
    await utimes(join(storage, asset.id), old, old);
    await expect(store.read(asset.id)).rejects.toThrow("expired");
    await expect(store.remove(asset.id)).resolves.toBeUndefined();
    await expect(store.cleanup()).resolves.toBeUndefined();
  });
});
