// @vitest-environment node

/**
 * @file tests/int/source-promotion-github.int.spec.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Проверяет non-force exact ref publication и idempotent draft Pull Request API.
 */

import { describe, expect, it, vi } from "vitest";

import {
  publishExactGitHubBranch,
  type SourcePromotionGitExecutor,
} from "../../services/ai-execution-worker/src/sourcePromotionGit";
import { ensureGitHubDraftPullRequest } from "../../services/ai-execution-worker/src/sourcePromotionGitHub";

const gitCommit = "a".repeat(40);
const headBranch = "ai/changes/42-123456789abc";

describe("GitHub source promotion adapter", () => {
  it("publishes one exact branch without force or token in argv", async () => {
    const calls: Array<{
      args: string[];
      environment: NodeJS.ProcessEnv;
    }> = [];
    let remoteCommit = "";
    const execute: SourcePromotionGitExecutor = async (
      _command,
      args,
      options,
    ) => {
      calls.push({ args, environment: options.env });
      if (args[0] === "remote") {
        return { stdout: "git@github.com:realize/example.git\n" };
      }
      if (args[0] === "rev-parse") return { stdout: `${gitCommit}\n` };
      if (args.includes("ls-remote")) {
        return {
          stdout: remoteCommit
            ? `${remoteCommit}\trefs/heads/${headBranch}\n`
            : "",
        };
      }
      if (args.includes("push")) {
        remoteCommit = gitCommit;
        return { stdout: "" };
      }
      throw new Error(`Unexpected Git command: ${args.join(" ")}`);
    };

    await publishExactGitHubBranch(
      {
        gitCommand: "/usr/bin/git",
        gitCommit,
        headBranch,
        repositoryRoot: process.cwd(),
        repositorySlug: "realize/example",
        timeoutMs: 10_000,
        token: "source-promotion-secret-token",
      },
      execute,
    );

    const push = calls.find((call) => call.args.includes("push"));
    expect(push?.args).toContain(`${gitCommit}:refs/heads/${headBranch}`);
    expect(push?.args).not.toContain("--force");
    expect(calls.flatMap((call) => call.args).join(" ")).not.toContain(
      "source-promotion-secret-token",
    );
    expect(push?.environment.REALIZE_AI_GITHUB_TOKEN).toBe(
      "source-promotion-secret-token",
    );
  });

  it("creates a draft PR once and validates its exact head SHA", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            base: { ref: "main" },
            draft: true,
            head: { ref: headBranch, sha: gitCommit },
            html_url: "https://github.com/realize/example/pull/17",
            number: 17,
            state: "open",
          }),
          { headers: { "Content-Type": "application/json" }, status: 201 },
        ),
      ) as unknown as typeof fetch;

    await expect(
      ensureGitHubDraftPullRequest(
        {
          baseBranch: "main",
          body: "Bound evidence",
          gitCommit,
          headBranch,
          repositorySlug: "realize/example",
          timeoutMs: 10_000,
          title: "chore(ai): verified change",
          token: "source-promotion-secret-token",
        },
        fetchImplementation,
      ),
    ).resolves.toEqual({
      draft: true,
      number: 17,
      state: "open",
      url: "https://github.com/realize/example/pull/17",
    });

    const post = vi.mocked(fetchImplementation).mock.calls[1];
    expect(post?.[0]).toBe(
      "https://api.github.com/repos/realize/example/pulls",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      base: "main",
      draft: true,
      head: headBranch,
      maintainer_can_modify: false,
    });
  });

  it("blocks an existing exact PR that is no longer an open draft", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            base: { ref: "main" },
            draft: false,
            head: { ref: headBranch, sha: gitCommit },
            html_url: "https://github.com/realize/example/pull/17",
            number: 17,
            state: "open",
          },
        ]),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    ) as unknown as typeof fetch;

    await expect(
      ensureGitHubDraftPullRequest(
        {
          baseBranch: "main",
          body: "Bound evidence",
          gitCommit,
          headBranch,
          repositorySlug: "realize/example",
          timeoutMs: 10_000,
          title: "chore(ai): verified change",
          token: "source-promotion-secret-token",
        },
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ blocked: true });
  });
});
