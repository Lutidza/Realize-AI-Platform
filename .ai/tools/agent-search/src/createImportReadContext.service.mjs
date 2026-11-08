/**
 * @file .ai/tools/agent-search/src/createImportReadContext.service.mjs
 * @version 1.1.0
 * @date 2026-10-29
 * @description Ограничивает и переиспользует чтения одного запроса, сохраняя footprint для snapshot.
 */
import { createHash } from "node:crypto";
import { IMPORT_RESOLUTION_LIMITS as limits } from "./importResolution.config.mjs";
import { SYNTAX_MAX_FILE_BYTES } from "./syntaxSearch.config.mjs";

import { runImportReadSteps } from "./runImportReadSteps.service.mjs";

/** @param {import('./ImportResolution.types.d.mts').ImportReadAdapter} adapter */
export function createImportReadContext(adapter, assertActive = () => {}) {
  return createContext(adapter, assertActive, false);
}

/** Общие budgets/cache/footprint; I/O обязан завершиться в текущем синхронном шаге. */
export function createImportReadContextSync(adapter, assertActive = () => {}) {
  return createContext(adapter, assertActive, true);
}

function createContext(adapter, assertActive, synchronous) {
  const files = new Map();
  const directories = new Map();
  const footprint = new Map();
  const stats = {
    filesRead: 0,
    bytesRead: 0,
    probes: 0,
    excludedFiles: 0,
    blockedCandidates: 0,
    exhausted: false,
  };
  const canonical = (path) =>
    typeof path === "string" &&
    path.length <= 4096 &&
    !/[\x00-\x1f\x7f\\:]/u.test(path) &&
    !path.startsWith("/") &&
    path.split("/").every((part) => part && part !== "." && part !== "..");
  const record = (key, result) => {
    footprint.set(
      key,
      result.status === "ok"
        ? (result.sha256 ??
            createHash("sha256").update(result.text).digest("hex"))
        : result.status,
    );
    return result;
  };
  const reserve = () => {
    assertActive();
    if (
      stats.exhausted ||
      stats.probes >= limits.probes ||
      stats.filesRead >= limits.files ||
      stats.bytesRead >= limits.bytes
    ) {
      stats.exhausted = true;
      return false;
    }
    stats.probes++;
    return true;
  };
  return {
    stats,
    footprint,
    assertActive,
    read: (path, purpose) =>
      runImportReadSteps(read(path, purpose), synchronous),
    listDirectories: (path) =>
      runImportReadSteps(listDirectories(path), synchronous),
    configCache: new Map(),
  };

  function* read(path, purpose = "source") {
    assertActive();
    // Проверка purpose происходит до cache lookup: config grant не становится source grant.
    if (!canonical(path) || !adapter.isAllowed(path, purpose)) {
      const key = `denied:${purpose}:${path}`;
      if (!footprint.has(key)) {
        if (!reserve()) return { status: "scan_budget" };
        stats.blockedCandidates++;
        footprint.set(key, "forbidden");
      }
      return { status: "forbidden" };
    }
    if (files.has(path)) return files.get(path);
    if (!reserve()) return { status: "scan_budget" };
    let bytes = 0;
    const maximumBytes = Math.min(
      SYNTAX_MAX_FILE_BYTES,
      limits.bytes - stats.bytesRead,
    );
    const result = yield adapter.read(path, {
      maximumBytes,
      onReadBytes(count) {
        bytes += count;
        stats.bytesRead += count;
        assertActive();
      },
    });
    assertActive();
    if (result.status === "ok" || bytes > 0) stats.filesRead++;
    if (["forbidden", "file_too_large"].includes(result.status))
      stats.excludedFiles++;
    if (
      result.status === "file_too_large" &&
      maximumBytes < SYNTAX_MAX_FILE_BYTES
    ) {
      stats.exhausted = true;
      return record(path, { status: "scan_budget" });
    }
    if (stats.bytesRead > limits.bytes) {
      stats.exhausted = true;
      return record(path, { status: "scan_budget" });
    }
    files.set(path, record(path, result));
    return result;
  }

  function* listDirectories(path) {
    assertActive();
    if (!canonical(path)) return { status: "forbidden" };
    if (directories.has(path)) return directories.get(path);
    if (!reserve()) return { status: "scan_budget" };
    const result = yield adapter.listDirectories(path, limits.directoryEntries);
    assertActive();
    if (result.status === "scan_budget") stats.exhausted = true;
    footprint.set(`directory:${path}`, result.fingerprint ?? result.status);
    directories.set(path, result);
    return result;
  }
}
