/**
 * @file .ai/tools/agent-search/src/ImportResolution.types.d.mts
 * @version 1.1.0
 * @date 2026-10-30
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
/** Синхронный trusted host сохраняет те же read grants и budgets. */
export type SynchronousImportReadAdapter = Omit<
  ImportReadAdapter,
  "read" | "listDirectories"
> & {
  read: (
    path: string,
    options: Parameters<ImportReadAdapter["read"]>[1],
  ) => ImportReadResult;
  listDirectories: (
    path: string,
    limit: number,
  ) => Awaited<ReturnType<ImportReadAdapter["listDirectories"]>>;
};
export type ImportReadContext = {
  read(
    path: string,
    purpose?: "source" | "config",
  ): ImportReadResult | Promise<ImportReadResult>;
  listDirectories(
    path: string,
  ):
    | ReturnType<SynchronousImportReadAdapter["listDirectories"]>
    | ReturnType<ImportReadAdapter["listDirectories"]>;
  assertActive(): void;
  configCache: Map<string, unknown>;
  footprint: Map<string, string>;
  stats: {
    filesRead: number;
    bytesRead: number;
    probes: number;
    excludedFiles: number;
    blockedCandidates: number;
    exhausted: boolean;
  };
};
export type SynchronousImportReadContext = Omit<
  ImportReadContext,
  "read" | "listDirectories"
> & {
  read(path: string, purpose?: "source" | "config"): ImportReadResult;
  listDirectories(
    path: string,
  ): ReturnType<SynchronousImportReadAdapter["listDirectories"]>;
};
export type ImportConfigurationSettings = {
  baseUrl?: string;
  /** Документ, объявивший эффективный baseUrl; сохраняется при наследовании/cache. */
  baseUrlSourcePath?: string;
  paths?: Record<string, string[]>;
  pathsDirectory?: string;
  /** Документ, объявивший эффективный paths; не обязательно ближайший tsconfig. */
  pathsSourcePath?: string;
  suffixes?: string[];
  conditions?: string[];
  legacy?: boolean;
};
export type ImportConfigurationResult =
  | {
      reason: ImportResolutionReason;
      settings?: undefined;
      configuration?: undefined;
    }
  | {
      reason?: undefined;
      settings: ImportConfigurationSettings;
      configuration: {
        path: string;
        hasExtends: boolean;
        /** Число config в самой длинной цепочке, включая текущую. */
        depth: number;
        /** Несколько bases на любом уровне требуют отдельной mutation policy. */
        hasMultipleBases: boolean;
      } | null;
    };
export type ModulePathResult =
  | { reason: ImportResolutionReason; path?: undefined; file?: undefined }
  | {
      reason?: undefined;
      path: string;
      file: Extract<ImportReadResult, { status: "ok" }>;
      /** Только relocation-exports: доказанный владелец точного package mapping. */
      packageExport?: { manifestPath: string; subpath: string; target: string };
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
