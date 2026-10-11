/**
 * @file .ai/tools/quality/checkInstructionGraph.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет существование источников и структурную связность активного агентского слоя.
 */
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  INSTRUCTION_LIMITS,
  INSTRUCTION_ROOTS,
} from "./instructionQuality.config";
import { parseInstructionMetadata } from "./parseInstructionMetadata.mapper";
import {
  readMarkdownAnchors,
  readMarkdownLinks,
} from "./readMarkdownLinks.util";
import type {
  InstructionDocument,
  InstructionQualityReport,
} from "./InstructionQuality.types";

/** Только bounded trusted checkout; metadata и ссылки не предоставляют полномочий. */
export async function checkInstructionGraph(
  root: string,
): Promise<InstructionQualityReport> {
  const base = await realpath(root);
  const report: InstructionQualityReport = {
    schemaVersion: "1.0",
    status: "passed",
    sourceHash: "",
    files: 0,
    bytes: 0,
    links: 0,
    issues: [],
    semanticReview: "required",
  };
  const documents = new Map<string, InstructionDocument>();
  const contents = new Map<string, string>();
  let entriesVisited = 0;
  const issue = (path: string, code: string, detail: string) => {
    if (report.issues.length >= 1000) throw new Error("issue_budget_exceeded");
    report.issues.push({ path, code, detail });
  };
  const requirePath = async (path: string) => {
    const absolute = resolve(base, path);
    const local = relative(base, absolute);
    if (
      !local ||
      local === ".." ||
      local.startsWith(`..${sep}`) ||
      isAbsolute(local) ||
      /(?:^|\/)(?:node_modules|\.git|\.env(?:\.[^/]*)?|auth\.json)(?:\/|$)/.test(
        local,
      )
    )
      throw new Error("path_forbidden");
    if ((await realpath(absolute)) !== absolute)
      throw new Error("symlink_forbidden");
    return absolute;
  };
  const read = async (path: string) => {
    if (contents.has(path)) return contents.get(path)!;
    const absolute = await requirePath(path);
    const before = await lstat(absolute);
    if (
      !before.isFile() ||
      before.size > INSTRUCTION_LIMITS.fileBytes ||
      contents.size >= INSTRUCTION_LIMITS.files ||
      report.bytes + before.size > INSTRUCTION_LIMITS.totalBytes
    )
      throw new Error("read_budget_or_type_invalid");
    const bytes = await readFile(absolute);
    if (
      bytes.length !== before.size ||
      (await lstat(absolute)).mtimeMs !== before.mtimeMs
    )
      throw new Error("source_changed");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    report.bytes += bytes.length;
    contents.set(path, text);
    return text;
  };
  const walk = async (path: string): Promise<void> => {
    if (++entriesVisited > 4000 || path.split("/").length > 24)
      throw new Error("scan_entry_budget_exceeded");
    const absolute = await requirePath(path);
    const stats = await lstat(absolute);
    if (stats.isDirectory()) {
      for (const name of (await readdir(absolute)).sort())
        await walk(`${path}/${name}`);
    } else if (path.endsWith(".md")) {
      const text = await read(path);
      try {
        documents.set(path, parseInstructionMetadata(path, text));
      } catch (error) {
        issue(
          path,
          "metadata_invalid",
          error instanceof Error && !("issues" in error)
            ? error.message
            : "Metadata schema mismatch",
        );
      }
    }
  };
  const pathStrings = (value: unknown): string[] =>
    typeof value === "string"
      ? /^(?:\.ai\/|\.codex\/|documentation\/|AGENTS\.md$|README\.md$)/.test(
          value,
        )
        ? [value]
        : []
      : Array.isArray(value)
        ? value.flatMap(pathStrings)
        : value && typeof value === "object"
          ? Object.values(value).flatMap(pathStrings)
          : [];
  try {
    for (const path of INSTRUCTION_ROOTS) {
      try {
        await walk(path);
      } catch (error) {
        issue(
          path,
          "source_unavailable",
          error instanceof Error ? error.message : "read_failed",
        );
      }
    }
    const identifiers = new Map<string, string>();
    const primaries = new Map<string, string>();
    const entryIDs = new Set<string>();
    for (const doc of documents.values()) {
      if (doc.artifactId) {
        const duplicate = identifiers.get(doc.artifactId);
        if (duplicate) issue(doc.path, "duplicate_artifact_id", duplicate);
        identifiers.set(doc.artifactId, doc.path);
      }
      for (const entry of doc.entries) {
        const primary = String(entry.primary_artifact);
        if (entryIDs.has(String(entry.entry_id)))
          issue(doc.path, "duplicate_entry_id", String(entry.entry_id));
        entryIDs.add(String(entry.entry_id));
        if (primaries.has(primary))
          issue(doc.path, "duplicate_registry_rule", primary);
        primaries.set(primary, doc.path);
        const rule = documents.get(primary);
        if (!rule) issue(doc.path, "registry_rule_missing", primary);
        for (const check of entry.related_checks as string[]) {
          const target = documents.get(check);
          if (!target) issue(doc.path, "registry_check_missing", check);
          else if (
            target.metadata.rule &&
            target.metadata.rule !== primary &&
            !(
              Array.isArray(target.metadata.related_rules) &&
              target.metadata.related_rules.includes(primary)
            )
          )
            issue(check, "check_rule_mismatch", primary);
        }
      }
      const refs = [
        ...pathStrings(doc.metadata),
        ...doc.entries.flatMap(pathStrings),
      ].map((path) => ({
        target: path
          .split(/\s/)[0]
          .split(/[*?{]/)[0]
          .replace(/[^/]*$/, (match) => (match.includes("[") ? "" : match)),
        rooted: true,
      }));
      refs.push(
        ...readMarkdownLinks(doc.text).map((target) => ({
          target,
          rooted: false,
        })),
      );
      for (const ref of refs) {
        report.links++;
        try {
          const [rawPath, rawAnchor] = ref.target.split("#");
          const local = rawPath
            ? ref.rooted
              ? rawPath
              : relative(
                  base,
                  resolve(base, dirname(doc.path), decodeURIComponent(rawPath)),
                )
            : doc.path;
          await requirePath(local);
          if (
            rawAnchor &&
            local.endsWith(".md") &&
            !readMarkdownAnchors(await read(local)).has(
              decodeURIComponent(rawAnchor),
            )
          )
            issue(doc.path, "anchor_missing", ref.target);
        } catch {
          issue(doc.path, "link_unavailable", ref.target);
        }
      }
    }
    for (const doc of documents.values()) {
      if (doc.path.startsWith(".ai/rules/") && !primaries.has(doc.path))
        issue(
          doc.path,
          "rule_not_registered",
          "Active rule has no registry entry",
        );
      if (
        doc.path.startsWith(".ai/rules/") &&
        typeof doc.metadata.check === "string"
      ) {
        const check = documents.get(doc.metadata.check);
        if (!check) issue(doc.path, "rule_check_missing", doc.metadata.check);
        else if (
          !pathStrings([
            check.metadata.rule,
            check.metadata.related_rule,
            check.metadata.related_rules,
          ]).includes(doc.path)
        )
          issue(doc.path, "rule_check_backlink_missing", doc.metadata.check);
      }
    }
  } catch (error) {
    issue(
      "<scan>",
      "scan_incomplete",
      error instanceof Error ? error.message : "scan_failed",
    );
  }
  report.files = documents.size;
  report.sourceHash = createHash("sha256")
    .update(
      JSON.stringify(
        [...contents]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([path, text]) => [
            path,
            createHash("sha256").update(text).digest("hex"),
          ]),
      ),
    )
    .digest("hex");
  report.status = report.issues.length ? "failed" : "passed";
  return report;
}
