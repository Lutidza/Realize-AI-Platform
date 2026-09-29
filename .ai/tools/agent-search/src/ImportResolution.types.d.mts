/**
 * @file .ai/tools/agent-search/src/ImportResolution.types.d.mts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Описывает bounded I/O и статическую цепочку разрешения импорта независимо от CLI/MCP.
 */
export type ImportResolutionReason =
  | "external_dependency"
  | "not_found"
  | "forbidden"
  | "file_too_large"
  | "unsupported_specifier"
  | "unsupported_configuration"
  | "unsupported_export"
  | "unsupported_language"
  | "syntax_error"
  | "symbol_not_exported"
  | "ambiguous"
  | "cycle"
  | "max_depth"
  | "scan_budget";
export type ImportLocation = {
  path: string;
  line: number;
  column: number;
  name?: string;
  kind: string;
  fileSha256?: string;
};
export type ImportResolution = {
  status: "resolved" | "unresolved";
  reason: ImportResolutionReason | null;
  target: ImportLocation | null;
  chain: ImportLocation[];
};
export type ImportReadResult =
  | { status: "ok"; text: string; sha256?: string }
  | { status: "not_found" | "forbidden" | "file_too_large" | "scan_budget" };
export type ImportReadAdapter = {
  isAllowed: (path: string, purpose: "source" | "config") => boolean;
  read: (
    path: string,
    options: {
      maximumBytes: number;
      onReadBytes: (bytes: number) => void;
    },
  ) => Promise<ImportReadResult>;
  listDirectories: (
    path: string,
    limit: number,
  ) => Promise<{
    status: "ok" | "not_found" | "forbidden" | "scan_budget";
    directories?: string[];
    fingerprint?: string;
  }>;
};
export type ImportResolutionOptions = {
  query: string;
  caseSensitive: boolean;
  maxDepth: number;
  coordinateUnit: "utf8_bytes" | "unicode_codepoints";
  assertActive?: () => void;
  maxMatches?: number;
  accept?: (match: unknown) => boolean;
  onMatch?: () => void;
};
