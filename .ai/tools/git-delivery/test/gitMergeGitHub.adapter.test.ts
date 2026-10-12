/**
 * @file .ai/tools/git-delivery/test/gitMergeGitHub.adapter.test.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет фиксированные REST blob/tree/ref запросы и отсутствие credential/raw bodies в ошибках approved-tree adapter.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GitMergeGitHubAdapter } from "../src/merge/GitMergeGitHub.adapter.ts";

test("REST adapter использует pinned URL, base64 blob, base_tree и только force:false", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const oid = "a".repeat(40);
  const implementation: typeof fetch = async (url, options) => {
    calls.push({ url: String(url), options: options! });
    return Response.json(
      String(url).includes("/git/refs/")
        ? { ref: "refs/heads/main", object: { type: "commit", sha: oid } }
        : { sha: oid },
    );
  };
  const adapter = new GitMergeGitHubAdapter(
    "fixture-private-token",
    "Owner/Repo",
    implementation,
  );
  await adapter.createBlob(Buffer.from("accepted bytes"));
  await adapter.createTree("b".repeat(40), [
    { path: "nested/file.txt", mode: "100644", blobOid: oid },
    { path: "deleted.txt", mode: null, blobOid: null },
  ]);
  await adapter.updateRef("refs/heads/main", oid);
  assert.deepEqual(
    calls.map((item) => item.options.method),
    ["POST", "POST", "PATCH"],
  );
  for (const item of calls) {
    assert(item.url.startsWith("https://api.github.com/repos/Owner/Repo/git/"));
    assert.equal(item.options.redirect, "error");
    assert.equal(
      new Headers(item.options.headers).get("Authorization"),
      "Bearer fixture-private-token",
    );
    assert(item.options.signal);
  }
  assert.deepEqual(JSON.parse(String(calls[0].options.body)), {
    content: Buffer.from("accepted bytes").toString("base64"),
    encoding: "base64",
  });
  assert.deepEqual(JSON.parse(String(calls[1].options.body)), {
    base_tree: "b".repeat(40),
    tree: [
      { path: "nested/file.txt", mode: "100644", type: "blob", sha: oid },
      { path: "deleted.txt", mode: "100644", type: "blob", sha: null },
    ],
  });
  assert.deepEqual(JSON.parse(String(calls[2].options.body)), {
    sha: oid,
    force: false,
  });
});

test("GET отсутствующего object возвращает null/false, не создавая его", async () => {
  const calls: string[] = [];
  const adapter = new GitMergeGitHubAdapter(
    "fixture-private-token",
    "Owner/Repo",
    async (url, options) => {
      calls.push(String(options?.method));
      return new Response("private response", { status: 404 });
    },
  );
  assert.equal(await adapter.readCommit("a".repeat(40)), null);
  assert.equal(await adapter.readTree("b".repeat(40)), null);
  assert.equal(await adapter.hasBlob("c".repeat(40)), false);
  assert.deepEqual(calls, ["GET", "GET", "GET"]);
});
for (const variant of ["http", "cap", "redirect", "transport"] as const)
  test(`${variant}: safe ошибка не раскрывает token/server body`, async () => {
    const adapter = new GitMergeGitHubAdapter(
      "fixture-private-token",
      "Owner/Repo",
      async () => {
        if (variant === "transport")
          throw Error("fixture-private-token private-response");
        if (variant === "http")
          return new Response("fixture-private-token private-response", {
            status: 403,
          });
        if (variant === "cap")
          return new Response("private-response", {
            headers: { "content-length": String(9 * 1024 * 1024) },
          });
        return {
          ok: true,
          redirected: true,
          body: new ReadableStream(),
        } as Response;
      },
    );
    await assert.rejects(
      () => adapter.readRepository(),
      (error) => {
        const message = String(error);
        assert.equal(message.includes("fixture-private-token"), false);
        assert.equal(message.includes("private-response"), false);
        return true;
      },
    );
  });
