/**
 * @file .ai/tools/agent-search/src/SyntaxSearch.types.d.mts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Описывает чистые результаты parser без I/O и зависимостей на приложение.
 */
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
