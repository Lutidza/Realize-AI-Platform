/**
 * @file tests/int/installed-search-acceptance.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет refusal границы installed acceptance: build/source, реальные event IDs, недостающий ChatGPT и stale ссылки.
 * @see documentation/architecture/repository-search.md
 */
// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readInstalledSearchAcceptance as inspectInstalled } from "../../.ai/tools/agent-search/acceptance/readInstalledSearchAcceptance.adapter.mjs";
import {
  INSTALLED_SEARCH_CHECKS,
  installedSearchAcceptanceSchema,
} from "../../.ai/tools/agent-search/acceptance/installedSearchAcceptance.schemas.mjs";
import { writeInstalledSearchBinding } from "../../.ai/tools/agent-search/src/installedSearchBinding.adapter.mjs";
import { searchObservationFixture } from "./searchObservation.fixture";
import { parseBenchmarkOptions } from "../../.ai/tools/agent-search/benchmark/parseBenchmarkOptions.validator.mjs";
import type { SearchObservation } from "@realize/ai-contracts";

vi.mock(
  "../../.ai/tools/agent-search/src/searchSourceBinding.adapter.mjs",
  () => ({ readSearchSourceVersion: async () => "a".repeat(64) }),
);
const readInstalledSearchAcceptance = (
  root: string,
  path: string | undefined,
  readEvents: Parameters<typeof inspectInstalled>[2],
  environment: NodeJS.ProcessEnv,
) =>
  inspectInstalled(root, path, readEvents, environment, async () => ({
    sourceVersion: "a".repeat(64),
    installedBuildID: "installed-build",
  }));
let root: string;
const sourceVersion = "a".repeat(64),
  installedBuildID = "installed-build";
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "realize-installed-acceptance-"));
  await mkdir(join(root, ".next"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, ".next/BUILD_ID"), installedBuildID);
  await writeInstalledSearchBinding(root, sourceVersion, { NODE_ENV: "test" });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function evidence() {
  const text = "export const installedTarget = 1;\n";
  await writeFile(join(root, "src/target.ts"), text);
  const url = new URL("http://127.0.0.1:3000/api/realize-ai/chat/project-file");
  url.searchParams.set("path", "src/target.ts");
  url.searchParams.set("startLine", "1");
  url.searchParams.set(
    "expectedSha256",
    createHash("sha256").update(text).digest("hex"),
  );
  const events = INSTALLED_SEARCH_CHECKS.flatMap((key: string) => {
    const consumer = (
      key.startsWith("admin-") ? "admin" : key
    ) as SearchObservation["consumer"];
    return (
      key === "cli" ? [undefined] : ["repo_search", "repo_read_file"]
    ).map((tool) =>
      searchObservationFixture({
        consumer,
        sourceVersion,
        installedBuildID,
        runID: key,
        tool: tool as SearchObservation["tool"],
        source: key === "cli" ? "cli" : "mcp",
      }),
    );
  });
  const checks = INSTALLED_SEARCH_CHECKS.map((key: string) => ({
    consumer: key,
    confirmedAt: new Date().toISOString(),
    evidenceKind: "operator-confirmed",
    eventIDs: events
      .filter((event) => event.runID === key)
      .map((event) => event.eventID),
    runID: key,
    sourceUrl: url.href,
    ...(key === "chatgpt"
      ? { conversationURL: "https://chatgpt.com/c/operator-real-conversation" }
      : {}),
  }));
  const value = {
    schemaVersion: "1.0",
    sourceVersion,
    installedBuildID,
    checks,
  };
  const path = join(root, "evidence.json");
  await writeFile(path, JSON.stringify(value));
  return {
    path,
    events,
    value,
    save: () => writeFile(path, JSON.stringify(value)),
  };
}
describe("installed acceptance evidence boundaries", () => {
  it("build files alone do not prove the version actually served by web", async () => {
    const data = await evidence();
    expect(
      await inspectInstalled(
        root,
        data.path,
        async () => data.events,
        { NODE_ENV: "test" },
        async () => ({ sourceVersion, installedBuildID: "old-active-web" }),
      ),
    ).toMatchObject({
      outcome: "incomplete",
      reason: "active_build_missing_or_stale",
    });
  });
  it("returns incomplete before querying DB for missing or stale compiled build", async () => {
    await rm(join(root, ".next/realize-search-build.json"));
    const read = vi.fn();
    const result = await readInstalledSearchAcceptance(root, undefined, read, {
      NODE_ENV: "test",
    });
    expect(result).toMatchObject({
      outcome: "incomplete",
      reason: "installed_build_missing_or_stale",
    });
    expect(read).not.toHaveBeenCalled();
  });
  it("accepts all seven only with matching stored events and current source link", async () => {
    const data = await evidence();
    const result = await readInstalledSearchAcceptance(
      root,
      data.path,
      async () => data.events,
      { NODE_ENV: "test" },
    );
    expect(result.outcome).toBe("passed");
    expect(result.missing).toEqual([]);
    expect(result.checks).toHaveLength(7);
  });
  it.each([
    "https://chatgpt.com/g/g-p-0123456789abcdef0123456789abcdef-project/c/operator-real-conversation",
    "https://chatgpt.com/g/g-example-assistant/c/operator-real-conversation",
  ])(
    "принимает настоящий формат диалога внутри GPT или проекта: %s",
    async (conversationURL) => {
      const data = await evidence();
      data.value.checks.find(
        (check) => check.consumer === "chatgpt",
      )!.conversationURL = conversationURL;
      expect(
        installedSearchAcceptanceSchema
          .parse(data.value)
          .checks.find((check) => check.consumer === "chatgpt")
          ?.conversationURL,
      ).toBe(conversationURL);
      await data.save();
      const result = await readInstalledSearchAcceptance(
        root,
        data.path,
        async () => data.events,
        { NODE_ENV: "test" },
      );
      expect(result).toMatchObject({ outcome: "passed", missing: [] });
      expect(result.checks).toHaveLength(7);
    },
  );
  it.each([
    "http://chatgpt.com/c/operator-real-conversation",
    "https://chatgpt.com.evil.example/c/operator-real-conversation",
    "https://user@chatgpt.com/c/operator-real-conversation",
    "https://chatgpt.com:443/c/operator-real-conversation",
    "https://chatgpt.com/share/operator-real-conversation",
    "https://chatgpt.com/g/g-example-assistant",
    "https://chatgpt.com/g/unknown/c/operator-real-conversation",
    "https://chatgpt.com/g/g-example/../c/operator-real-conversation",
    "https://chatgpt.com/g/g-example%2Fother/c/operator-real-conversation",
    "https://chatgpt.com/g/g-example/c/short",
    "https://chatgpt.com/g/g-example/c/operator-real-conversation/extra",
    "https://chatgpt.com/g/g-example/c/operator-real-conversation?x=1",
    "https://chatgpt.com/g/g-example/c/operator-real-conversation#fragment",
    "https://chatgpt.com/c/operator-real-conversation\n",
    `https://chatgpt.com/g/g-${"x".repeat(129)}/c/operator-real-conversation`,
  ])(
    "отклоняет неподходящий URL диалога до чтения событий: %s",
    async (conversationURL) => {
      const data = await evidence();
      data.value.checks.find(
        (check) => check.consumer === "chatgpt",
      )!.conversationURL = conversationURL;
      await data.save();
      const readEvents = vi.fn(async () => data.events);
      expect(
        await readInstalledSearchAcceptance(root, data.path, readEvents, {
          NODE_ENV: "test",
        }),
      ).toMatchObject({
        outcome: "incomplete",
        reason: "installed_consumer_evidence_invalid",
      });
      expect(readEvents).not.toHaveBeenCalled();
    },
  );
  it("configured chatgpt consumer events alone never replace real external confirmation", async () => {
    const data = await evidence();
    const chatgpt = data.value.checks.find(
      (check) => check.consumer === "chatgpt",
    )!;
    delete chatgpt.conversationURL;
    await data.save();
    const result = await readInstalledSearchAcceptance(
      root,
      data.path,
      async () => data.events,
      { NODE_ENV: "test" },
    );
    expect(result).toMatchObject({
      outcome: "incomplete",
      missing: ["chatgpt"],
    });
  });
  it("rejects unrecorded or different-build events and duplicate reuse", async () => {
    const data = await evidence();
    const result = await readInstalledSearchAcceptance(
      root,
      data.path,
      async () =>
        data.events.map((event) => ({ ...event, installedBuildID: "older" })),
      { NODE_ENV: "test" },
    );
    expect(result.outcome).toBe("incomplete");
    expect(result.checks).toHaveLength(0);
    data.value.checks[1].eventIDs = data.value.checks[0].eventIDs;
    await data.save();
    expect(
      await readInstalledSearchAcceptance(
        root,
        data.path,
        async () => data.events,
        { NODE_ENV: "test" },
      ),
    ).toMatchObject({
      outcome: "incomplete",
      reason: "installed_consumer_evidence_duplicate",
    });
  });
  it("does not accept stale links or failed search/read as valid target evidence", async () => {
    const data = await evidence();
    await writeFile(join(root, "src/target.ts"), "changed\n");
    const result = await readInstalledSearchAcceptance(
      root,
      data.path,
      async () => data.events,
      { NODE_ENV: "test" },
    );
    expect(result.missing).toEqual([
      "admin-direct",
      "admin-subagent",
      "mcp",
      "chatgpt",
    ]);
  });
  it("marks unavailable DB incomplete without exposing the connection error", async () => {
    const data = await evidence();
    expect(
      await readInstalledSearchAcceptance(
        root,
        data.path,
        async () => {
          throw Error("private-connection-error");
        },
        { NODE_ENV: "test" },
      ),
    ).toMatchObject({
      outcome: "incomplete",
      reason: "installed_diagnostics_unavailable",
    });
  });
  it("не принимает ссылку на другой origin с правильным hash", async () => {
    const data = await evidence();
    const external = data.value.checks.find(
      (check) => check.consumer === "chatgpt",
    )!;
    external.sourceUrl = external.sourceUrl.replace(
      "127.0.0.1:3000",
      "unrelated.example",
    );
    await data.save();
    expect(
      await readInstalledSearchAcceptance(
        root,
        data.path,
        async () => data.events,
        { NODE_ENV: "test" },
      ),
    ).toMatchObject({ outcome: "incomplete", missing: ["chatgpt"] });
  });
  it("release label is explicit and repetitions/options remain bounded", () => {
    expect(
      parseBenchmarkOptions(["--runs=2", "--release=v2", "--navigation"], true),
    ).toEqual({ runs: 2, release: "v2", navigation: true });
    for (const args of [
      ["--runs=6"],
      ["--release=bad label"],
      ["--runs=1", "--runs=2"],
      ["--navigation"],
    ])
      expect(() => parseBenchmarkOptions(args)).toThrow();
  });
});
