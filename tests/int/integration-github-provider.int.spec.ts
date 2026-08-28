// @vitest-environment node

/**
 * @file tests/int/integration-github-provider.int.spec.ts
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Verifies bounded GitHub REST checks without live network access.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { testGitHubConnection } from "../../packages/payload-ai-plugin/src/integrations/githubProvider";

afterEach(() => vi.unstubAllGlobals());

describe("GitHub integration provider", () => {
  it("confirms repository identity and push access without returning token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        default_branch: "main",
        full_name: "Realize/Store",
        permissions: { push: true },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const token = "integration-provider-test-token-123456789";

    const result = await testGitHubConnection({
      repositorySlug: "realize/store",
      token,
    });

    expect(result).toMatchObject({
      defaultBranch: "main",
      repositorySlug: "realize/store",
      status: "passed",
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/realize/store",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
        method: "GET",
      }),
    );
  });

  it("fails safely when the token cannot write candidate refs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          default_branch: "main",
          full_name: "realize/store",
          permissions: { push: false },
        }),
      ),
    );

    await expect(
      testGitHubConnection({
        repositorySlug: "realize/store",
        token: "integration-provider-test-token-123456789",
      }),
    ).resolves.toMatchObject({ status: "failed" });
  });
});
