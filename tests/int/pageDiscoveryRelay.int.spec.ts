// @vitest-environment node
/**
 * @file tests/int/pageDiscoveryRelay.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет транспорт callback: серверный адрес, лимиты, отмену и отсутствие утечки credentials.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPageDiscoveryReadTools } from "../../services/ai-control-plane/src/pageDiscoveryTools.adapter";
import type { ControlPlaneRun } from "../../services/ai-control-plane/src/runStore";

const grant = {
  endpoint: "http://localhost:3000/api/realize-ai/chat/page-tools/run-1",
  token: "private-credential-" + "x".repeat(40),
};
const run = (): ControlPlaneRun => ({
  id: "run-1",
  prompt: "Найди доставку",
  status: "running",
  cancelRequested: false,
  events: [],
  pageDiscovery: grant,
});
const call = {
  callID: "call-1",
  name: "pages_search",
  arguments: { query: "достав" },
};
const data = {
  pages: [
    { id: "17", title: "Доставка", adminUrl: "/admin/collections/pages/17" },
  ],
  page: 1,
  totalPages: 1,
  totalDocs: 1,
};
afterEach(() => vi.unstubAllGlobals());

describe("private page discovery relay", () => {
  it("provides no tools without the server grant and dispatches only to the bound endpoint", async () => {
    expect(
      createPageDiscoveryReadTools({ ...run(), pageDiscovery: undefined }),
    ).toBeUndefined();
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, data }));
    vi.stubGlobal("fetch", fetch);
    const tools = createPageDiscoveryReadTools(run())!;
    expect(tools.definitions.map((tool) => tool.name)).toEqual([
      "pages_search",
      "pages_read",
      "pages_structure",
    ]);
    expect(JSON.stringify(tools.definitions)).not.toContain(grant.token);
    expect(await tools.execute(call)).toEqual(data);
    expect(fetch).toHaveBeenCalledWith(
      grant.endpoint,
      expect.objectContaining({
        redirect: "error",
        method: "POST",
        body: JSON.stringify(call),
        headers: {
          Authorization: `Bearer ${grant.token}`,
          "Content-Type": "application/json",
        },
      }),
    );
    await expect(
      tools.execute({
        ...call,
        arguments: { ...call.arguments, endpoint: "http://attacker" },
      }),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 404, 409, 429, 500])(
    "sanitizes upstream error %s without exposing its body",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json(
            {
              ok: false,
              error: { message: `${grant.token} ${grant.endpoint}` },
            },
            { status },
          ),
        ),
      );
      const result = await createPageDiscoveryReadTools(run())!.execute(call);
      expect(result).toMatchObject({ ok: false });
      expect(JSON.stringify(result)).not.toContain(grant.token);
      expect(JSON.stringify(result)).not.toContain(grant.endpoint);
    },
  );
  it("fails closed on oversized, invalid and raw-document responses", async () => {
    for (const response of [
      new Response("x".repeat(128 * 1024 + 1)),
      new Response("<html>internal proxy error</html>"),
      Response.json({ ok: true, data: { ...data, secret: grant.token } }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(
        createPageDiscoveryReadTools(run())!.execute(call),
      ).rejects.toThrow("page_tool_service_unavailable");
    }
  });
  it("rejects cancelled or revoked runs before dispatch and discards an in-flight result after cancellation", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, data }));
    vi.stubGlobal("fetch", fetch);
    const cancelled = run();
    cancelled.cancelRequested = true;
    await expect(
      createPageDiscoveryReadTools(cancelled)!.execute(call),
    ).rejects.toThrow();
    const abort = new AbortController();
    abort.abort();
    await expect(
      createPageDiscoveryReadTools(run(), abort.signal)!.execute(call),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    const active = run();
    fetch.mockImplementationOnce(async () => {
      active.cancelRequested = true;
      return Response.json({ ok: true, data });
    });
    await expect(
      createPageDiscoveryReadTools(active)!.execute(call),
    ).rejects.toThrow("page_tool_service_unavailable");
  });
});
