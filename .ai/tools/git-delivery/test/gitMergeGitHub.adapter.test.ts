/**
 * @file .ai/tools/git-delivery/test/gitMergeGitHub.adapter.test.ts
 * @version 1.0.1
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

test("GET tree принимает только точный bounded 422 absent-object response", async () => {
  const calls: { url: string; method: string | undefined }[] = [];
  const oid = "b".repeat(40);
  const adapter = new GitMergeGitHubAdapter(
    "fixture-private-token",
    "Owner/Repo",
    async (url, options) => {
      calls.push({ url: String(url), method: options?.method });
      return Response.json(
        { message: "Invalid object requested. SHA must identify a commit or a tree." },
        { status: 422 },
      );
    },
  );
  assert.equal(await adapter.readTree(oid), null);
  assert.deepEqual(calls, [{
    url: `https://api.github.com/repos/Owner/Repo/git/trees/${oid}?recursive=1`,
    method: "GET",
  }]);
});

test("422 для других endpoints/messages, malformed/oversized JSON и 403 блокируются", async () => {
  const absentMessage = "Invalid object requested. SHA must identify a commit or a tree.";
  for (const variant of ["different", "malformed", "oversized", "403", "commit", "blob", "repository", "post", "patch"] as const) {
    const methods: string[] = [];
    const adapter = new GitMergeGitHubAdapter(
      "fixture-private-token",
      "Owner/Repo",
      async (_url, options) => {
        methods.push(String(options?.method));
        if (variant === "malformed") return new Response("{", { status: 422 });
        return Response.json({
          message: variant === "different" ? "private-response" : absentMessage,
          ...(variant === "oversized" ? { detail: "x".repeat(4096) } : {}),
        }, { status: variant === "403" ? 403 : 422 });
      },
    );
    const invoke = () => {
      if (variant === "commit") return adapter.readCommit("a".repeat(40));
      if (variant === "blob") return adapter.hasBlob("a".repeat(40));
      if (variant === "repository") return adapter.readRepository();
      if (variant === "post") return adapter.createTree("a".repeat(40), []);
      if (variant === "patch") return adapter.updateRef("refs/heads/main", "a".repeat(40));
      return adapter.readTree("a".repeat(40));
    };
    await assert.rejects(invoke, (error) => {
      assert.equal(String(error).includes("private-response"), false);
      assert.equal(String(error).includes(absentMessage), false);
      return true;
    });
    assert.deepEqual(methods, [variant === "post" ? "POST" : variant === "patch" ? "PATCH" : "GET"]);
  }
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
