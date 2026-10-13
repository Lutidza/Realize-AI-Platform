/**
 * @file .ai/tools/git-delivery/src/merge/GitMergeGitHub.adapter.ts
 * @version 1.0.1
 * @date 2026-10-13
 * @description Исполняет только фиксированные GitHub object/ref операции approved-tree merge с deadline и лимитом ответа.
 */
import { PolicyError } from "../Policy.error.ts";
import type {
  GitMergeCommit,
  GitMergeCommitBody,
  GitMergeRemote,
  GitMergeTree,
  GitMergeCandidateFile,
} from "./GitMerge.types.ts";

function invalid(): never {
  throw new PolicyError(
    "merge_remote_response_invalid",
    "GitHub не подтвердил ожидаемый объект или ref.",
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 16384) invalid();
  return value;
}
function sha(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{40}$/.test(result) || /^0+$/.test(result)) invalid();
  return result;
}
function commit(value: unknown): GitMergeCommit {
  const source = object(value);
  if (!Array.isArray(source.parents) || source.parents.length > 100) invalid();
  const person = (value: unknown) => {
    const input = object(value);
    return {
      name: text(input.name),
      email: text(input.email),
      date: text(input.date),
    };
  };
  return {
    sha: sha(source.sha),
    treeOid: sha(object(source.tree).sha),
    parents: source.parents.map((value) => sha(object(value).sha)),
    message: typeof source.message === "string" ? source.message : invalid(),
    author: person(source.author),
    committer: person(source.committer),
  };
}

/** Credential остаётся в header; методы не принимают произвольный URL, force или parent список от модели. */
export class GitMergeGitHubAdapter implements GitMergeRemote {
  private readonly root: string;
  private readonly signal = AbortSignal.timeout(90000);
  private calls = 0;
  constructor(
    private readonly token: string,
    slug: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(slug) ||
      !token ||
      /[\0\r\n]/.test(token)
    )
      invalid();
    this.root = `https://api.github.com/repos/${slug.split("/").map(encodeURIComponent).join("/")}`;
  }
  private async wait<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener("abort", abort);
        reject(
          new PolicyError(
            "merge_remote_unavailable",
            "GitHub операция не завершилась в пределах deadline.",
          ),
        );
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      void pending.then(
        (value) => {
          signal.removeEventListener("abort", abort);
          resolve(value);
        },
        () => {
          signal.removeEventListener("abort", abort);
          reject(
            new PolicyError(
              "merge_remote_unavailable",
              "GitHub операция недоступна.",
            ),
          );
        },
      );
    });
  }
  private async request(
    path: string,
    method: "GET" | "POST" | "PATCH" = "GET",
    body?: unknown,
    missing = false,
    maxResponseBytes = 8 * 1024 * 1024,
  ): Promise<unknown> {
    if (++this.calls > 4200)
      throw new PolicyError(
        "merge_remote_limit",
        "Превышен предел GitHub запросов одной операции.",
      );
    const signal = AbortSignal.any([this.signal, AbortSignal.timeout(10000)]);
    const response = await this.wait(
      this.fetchImplementation(`${this.root}${path}`, {
        method,
        redirect: "error",
        signal,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "User-Agent": "realize-git-approved-tree-merge",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      signal,
    );
    if (missing && response.status === 404) {
      void response.body?.cancel().catch(() => {});
      return null;
    }
    const missingTree =
      missing &&
      method === "GET" &&
      response.status === 422 &&
      !response.redirected &&
      /^\/git\/trees\/[a-f0-9]{40}\?recursive=1$/.test(path);
    if ((!response.ok && !missingTree) || response.redirected) {
      void response.body?.cancel().catch(() => {});
      throw new PolicyError(
        "merge_remote_request_failed",
        "GitHub отклонил назначенную object/ref операцию.",
      );
    }
    const responseLimit = missingTree ? 4096 : maxResponseBytes;
    const declared = response.headers.get("content-length");
    if (declared && Number(declared) > responseLimit) {
      void response.body?.cancel().catch(() => {});
      invalid();
    }
    const reader = response.body?.getReader();
    if (!reader) invalid();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await this.wait(reader.read(), signal);
        if (next.done) break;
        total += next.value.length;
        if (total > responseLimit) invalid();
        chunks.push(next.value);
      }
      let value: unknown;
      try {
        value = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            Buffer.concat(chunks),
          ),
        );
      } catch {
        invalid();
      }
      if (missingTree) {
        if (
          object(value).message !==
          "Invalid object requested. SHA must identify a commit or a tree."
        )
          throw new PolicyError(
            "merge_remote_request_failed",
            "GitHub отклонил назначенную object/ref операцию.",
          );
        return null;
      }
      return value;
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  async readRepository() {
    const source = object(await this.request(""));
    if (!Number.isSafeInteger(source.id) || Number(source.id) < 1) invalid();
    return { id: Number(source.id), fullName: text(source.full_name) };
  }
  private encodedRef(ref: string): string {
    if (!ref.startsWith("refs/heads/")) invalid();
    return ref.slice(5).split("/").map(encodeURIComponent).join("/");
  }
  async readRef(ref: string): Promise<string> {
    const source = object(
      await this.request(`/git/ref/${this.encodedRef(ref)}`),
    );
    if (source.ref !== ref || object(source.object).type !== "commit")
      invalid();
    return sha(object(source.object).sha);
  }
  async readCommit(oid: string): Promise<GitMergeCommit | null> {
    const value = await this.request(
      `/git/commits/${sha(oid)}`,
      "GET",
      undefined,
      true,
    );
    return value === null ? null : commit(value);
  }
  async readTree(oid: string): Promise<GitMergeTree | null> {
    const value = await this.request(
      `/git/trees/${sha(oid)}?recursive=1`,
      "GET",
      undefined,
      true,
    );
    if (value === null) return null;
    const source = object(value);
    if (!Array.isArray(source.tree) || typeof source.truncated !== "boolean")
      invalid();
    return {
      sha: sha(source.sha),
      truncated: source.truncated,
      tree: source.tree.map((value) => {
        const entry = object(value);
        return {
          path: text(entry.path),
          mode: text(entry.mode),
          type: text(entry.type),
          sha: sha(entry.sha),
        };
      }),
    };
  }
  async hasBlob(oid: string): Promise<boolean> {
    const value = await this.request(
      `/git/blobs/${sha(oid)}`,
      "GET",
      undefined,
      true,
      24 * 1024 * 1024,
    );
    if (value === null) return false;
    if (sha(object(value).sha) !== oid) invalid();
    return true;
  }
  async createBlob(bytes: Buffer): Promise<string> {
    if (bytes.length > 16 * 1024 * 1024) invalid();
    return sha(
      object(
        await this.request("/git/blobs", "POST", {
          content: bytes.toString("base64"),
          encoding: "base64",
        }),
      ).sha,
    );
  }
  async createTree(
    baseTree: string,
    entries: GitMergeCandidateFile[],
  ): Promise<string> {
    return sha(
      object(
        await this.request("/git/trees", "POST", {
          base_tree: sha(baseTree),
          tree: entries.map((file) => ({
            path: file.path,
            mode: file.mode ?? "100644",
            type: "blob",
            sha: file.blobOid,
          })),
        }),
      ).sha,
    );
  }
  async createCommit(body: GitMergeCommitBody): Promise<GitMergeCommit> {
    return commit(await this.request("/git/commits", "POST", body));
  }
  async updateRef(ref: string, oid: string): Promise<string> {
    const source = object(
      await this.request(`/git/refs/${this.encodedRef(ref)}`, "PATCH", {
        sha: sha(oid),
        force: false,
      }),
    );
    if (source.ref !== ref || object(source.object).type !== "commit")
      invalid();
    return sha(object(source.object).sha);
  }
}
