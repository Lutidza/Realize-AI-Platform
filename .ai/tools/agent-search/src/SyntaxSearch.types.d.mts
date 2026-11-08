/**
 * @file .ai/tools/agent-search/src/SyntaxSearch.types.d.mts
 * @version 1.1.0
 * @date 2026-10-29
 * @description Описывает чистые результаты parser без I/O и зависимостей на приложение.
 */
import type ts from "typescript";

/** Module expressions сохраняются и для неподдержанных literal/computed форм. */
export type SyntaxModuleReference = {
  kind: "import" | "export" | "dynamic_import" | "require";
  form:
    | "import"
    | "export"
    | "import_equals"
    | "import_type"
    | "dynamic_import"
    | "require"
    | "require_property";
  specifier: ts.Node | undefined;
  argumentCount?: number;
};

export type SyntaxKind =
  | "function"
  | "class"
  | "method"
  | "type"
  | "interface"
  | "enum"
  | "variable"
  | "property"
  | "parameter"
  | "namespace"
  | "reference"
  | "import"
  | "export"
  | "dynamic_import"
  | "require";
export type SyntaxSearchOptions = {
  intent: "definitions" | "references" | "imports";
  query: string;
  caseSensitive: boolean;
  assertActive?: () => void;
};
export type SyntaxMatch = {
  offset: number;
  line: number;
  character: number;
  lineText: string;
  syntax: {
    kind: SyntaxKind;
    name?: string;
    moduleSpecifier?: string;
    importedName?: string;
  };
};
