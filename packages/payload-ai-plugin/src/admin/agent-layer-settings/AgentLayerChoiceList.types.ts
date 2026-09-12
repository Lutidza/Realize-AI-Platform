/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerChoiceList.types.ts
 * @version 1.1.0
 * @date 2026-09-10
 * @description Описывает общий выбор ключей из записей черновика и системного реестра.
 */

/** Метаданные варианта не подменяют исходный тип записи или системного контракта. */
export type AgentLayerChoiceOption = {
  key: string;
  title: string;
  code?: string;
  description?: string;
  missing?: boolean;
  inactive?: boolean;
  inactiveIsProblem?: boolean;
  canOpen?: boolean;
};

export type UseAgentLayerChoiceListOptions = {
  options: readonly AgentLayerChoiceOption[];
  selectedKeys: readonly string[];
  disabled: boolean;
  mode?: "single" | "multiple" | "readOnly";
  limit?: number;
  onChange: (keys: readonly string[]) => void;
  /** Фильтр выдачи не исключает известные варианты из реестра выбранных ключей. */
  filterOption?: (option: AgentLayerChoiceOption) => boolean;
};

export type AgentLayerChoiceListState = {
  query: string;
  selectedOnly: boolean;
  page: number;
  pageCount: number;
  rows: readonly (AgentLayerChoiceOption & { selected: boolean })[];
  selectedCount: number;
  missingCount: number;
  totalCount: number;
  filteredCount: number;
  rangeStart: number;
  rangeEnd: number;
  limit: number;
  isAtLimit: boolean;
  disabled: boolean;
  mode: "single" | "multiple" | "readOnly";
  setQuery: (value: string) => void;
  setSelectedOnly: (value: boolean) => void;
  setPage: (value: number) => void;
  toggle: (key: string) => void;
};

export type AgentLayerChoiceListProps = {
  label: string;
  picker: AgentLayerChoiceListState;
  navigationDisabled?: boolean;
  onOpen?: (key: string) => void;
  emptyLabel?: string;
};
