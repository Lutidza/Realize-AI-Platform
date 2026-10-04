/**
 * @file .ai/tools/agent-search/acceptance/readInstalledSearchAcceptance.adapter.mjs
 * @version 1.0.0
 * @date 2026-09-30
 * @description Проверяет текущую сборку, реальные DB events и source hashes; отсутствие внешнего evidence оставляет приёмку incomplete.
 * @see documentation/architecture/repository-search.md
 */
import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { createRepositoryReadPolicy } from "../../../../services/ai-control-plane/src/repositoryReadPolicy.validator.ts";
import { readRepositoryFile } from "../../../../services/ai-control-plane/src/readRepositoryFile.service.ts";
import { searchObservationSchema } from "../../../../packages/ai-contracts/src/searchObservation.schemas.ts";
import { readSearchSourceVersion } from "../src/searchSourceBinding.adapter.mjs";
import { readInstalledSearchBinding } from "../src/installedSearchBinding.adapter.mjs";
import {
  INSTALLED_SEARCH_CHECKS,
  installedSearchAcceptanceSchema,
} from "./installedSearchAcceptance.schemas.mjs";

async function boundedRead(path, limit) {
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > limit ||
    (await realpath(path)) !== path
  )
    throw Error("installed_evidence_invalid");
  const data = await readFile(path);
  if (data.length > limit) throw Error("installed_evidence_limit");
  return data;
}
async function readActiveBuild(origin) {
  const response = await fetch(new URL("/api/health/live", origin), {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok || !response.body) throw Error("active_build_unavailable");
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((size += value.byteLength) > 4096) throw Error("active_build_limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")).searchBuild;
}
/** readEvents получает только UUIDs и выполняет read-only запрос; operator confirmation не заменяется SDK credential purpose. */
export async function readInstalledSearchAcceptance(
  root,
  evidencePath,
  readEvents,
  environment = process.env,
  readActive = readActiveBuild,
) {
  const sourceVersion = await readSearchSourceVersion(root);
  const binding = await readInstalledSearchBinding(
    root,
    sourceVersion,
    environment,
  );
  const result = {
    outcome: "incomplete",
    sourceVersion,
    installedBuildID: binding?.installedBuildID ?? null,
    checks: [],
    missing: [...INSTALLED_SEARCH_CHECKS],
  };
  if (!binding) {
    result.reason = "installed_build_missing_or_stale";
    return result;
  }
  const origin =
    environment.PAYLOAD_PUBLIC_SERVER_URL ||
    environment.NEXT_PUBLIC_SERVER_URL ||
    "http://127.0.0.1:3000";
  try {
    const active = await readActive(origin);
    if (
      active?.sourceVersion !== sourceVersion ||
      active?.installedBuildID !== binding.installedBuildID
    )
      throw Error("active_build_stale");
  } catch {
    result.reason = "active_build_missing_or_stale";
    return result;
  }
  if (!evidencePath) {
    result.reason = "installed_consumer_evidence_missing";
    return result;
  }
  let evidence;
  try {
    evidence = installedSearchAcceptanceSchema.parse(
      JSON.parse(
        (await boundedRead(resolve(evidencePath), 64 * 1024)).toString("utf8"),
      ),
    );
  } catch {
    result.reason = "installed_consumer_evidence_invalid";
    return result;
  }
  if (
    evidence.sourceVersion !== sourceVersion ||
    evidence.installedBuildID !== binding.installedBuildID
  ) {
    result.reason = "installed_consumer_evidence_stale";
    return result;
  }
  const ids = evidence.checks.flatMap((check) => check.eventIDs);
  if (
    new Set(ids).size !== ids.length ||
    new Set(evidence.checks.map((check) => check.consumer)).size !==
      evidence.checks.length
  ) {
    result.reason = "installed_consumer_evidence_duplicate";
    return result;
  }
  let events;
  try {
    events = (await readEvents(ids)).map((event) =>
      searchObservationSchema.parse(event),
    );
  } catch {
    result.reason = "installed_diagnostics_unavailable";
    return result;
  }
  for (const check of evidence.checks) {
    const selected = events.filter((event) =>
      check.eventIDs.includes(event.eventID),
    );
    const consumer = check.consumer.startsWith("admin-")
      ? "admin"
      : check.consumer;
    const since = Date.parse(check.confirmedAt) - 24 * 3600000;
    const valid =
      selected.length === check.eventIDs.length &&
      selected.every(
        (event) =>
          event.consumer === consumer &&
          event.sourceVersion === sourceVersion &&
          event.installedBuildID === binding.installedBuildID &&
          (event.outcome === "complete" ||
            (event.outcome === "partial" && event.reason === "page_limit")) &&
          event.observedAt >= new Date(since).toISOString() &&
          Date.parse(event.observedAt) <=
            Date.parse(check.confirmedAt) + 300000,
      );
    if (
      !valid ||
      Date.parse(check.confirmedAt) < Date.now() - 24 * 3600000 ||
      Date.parse(check.confirmedAt) > Date.now() + 300000
    )
      continue;
    if (
      consumer !== "cli" &&
      (!selected.some(
        (event) => event.tool === "repo_search" && event.returnedCount > 0,
      ) ||
        !selected.some(
          (event) => event.tool === "repo_read_file" && event.returnedCount > 0,
        ))
    )
      continue;
    if (
      ["admin", "execution", "review"].includes(consumer) &&
      (!check.runID || selected.some((event) => event.runID !== check.runID))
    )
      continue;
    if (["admin", "chatgpt", "mcp"].includes(consumer)) {
      if (
        !check.sourceUrl ||
        (consumer === "chatgpt" && !check.conversationURL)
      )
        continue;
      const origin = new URL(
        environment.PAYLOAD_PUBLIC_SERVER_URL ||
          environment.NEXT_PUBLIC_SERVER_URL ||
          "http://127.0.0.1:3000",
      );
      const url = new URL(check.sourceUrl, origin),
        path = url.searchParams.get("path");
      if (
        url.origin !== origin.origin ||
        ["path", "startLine", "expectedSha256"].some(
          (key) => url.searchParams.getAll(key).length !== 1,
        )
      )
        continue;
      if (
        !path ||
        path.startsWith("/") ||
        path
          .split(/[\\/]/)
          .some((segment) => segment === ".." || segment === ".")
      )
        continue;
      try {
        const file = await readRepositoryFile(
          await createRepositoryReadPolicy(root, false),
          path,
          { signal: AbortSignal.timeout(10000) },
        );
        if (file.sha256 !== url.searchParams.get("expectedSha256")) continue;
        if (
          Number(url.searchParams.get("startLine")) >
          file.text.split("\n").length
        )
          continue;
      } catch {
        continue;
      }
    }
    result.checks.push({
      consumer: check.consumer,
      eventIDs: check.eventIDs,
      calls: selected.length,
      durationMs: selected.reduce((sum, event) => sum + event.durationMs, 0),
      filesRead: selected.every((event) => event.filesRead !== null)
        ? selected.reduce((sum, event) => sum + event.filesRead, 0)
        : null,
      bytesRead: selected.every((event) => event.bytesRead !== null)
        ? selected.reduce((sum, event) => sum + event.bytesRead, 0)
        : null,
      outputBytes: selected.reduce((sum, event) => sum + event.outputBytes, 0),
      evidenceKind: check.evidenceKind,
    });
    result.missing = result.missing.filter(
      (consumer) => consumer !== check.consumer,
    );
  }
  if (!result.missing.length) result.outcome = "passed";
  else result.reason = "installed_consumer_checks_incomplete";
  return result;
}
