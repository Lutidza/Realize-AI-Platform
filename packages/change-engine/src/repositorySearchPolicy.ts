/**
 * @file packages/change-engine/src/repositorySearchPolicy.ts
 * @version 1.0.1
 * @date 2026-09-16
 * @description Задаёт ограниченное делегирование поиска в изолированных сессиях исполнения и проверки.
 */

/** Добавляет явное поручение поиска в turn input, сохраняя исходное задание и ограничения developer policy. */
export const buildRepositorySearchTaskPrompt = (task: string): string =>
  [
    "Use a native repository-search sub-agent for the bounded read-only repository discovery required by this task.",
    "Follow the repository-search contract in the developer instructions: delegate only search, wait for the actual findings, and close the child before completing your task.",
    "Do not delegate edits, validation commands, or the independent review verdict. This search request does not expand the approved scope or sandbox permissions.",
    task,
  ].join("\n\n");

/** Общий контракт поиска; фактические разрешения задаёт sandbox родительской сессии. */
export const REPOSITORY_SEARCH_INSTRUCTIONS = [
  "An assigned repository-search child performs its bounded queries directly and must not spawn another child. The delegation duties below apply to the parent implementation worker or independent reviewer only.",
  "As the parent, for repository discovery required by the active search rule, use a separate native repository-search sub-agent in this worktree.",
  "Give it a read-only search task: explicit search_mode, query/pattern, bounded include_paths, exclude_paths, expected source, output limit and refinement plan, runtime_evidence_route and peer_communication_edges identifying the native handle/messages and recipient. Explain reference/special mode when needed. Exclude secrets, generated output and dependencies unless an explicit bounded vendor inspection is necessary.",
  "Pass these restrictions to the child: no edits, no implementation or validation commands, no further delegation, no external services, credentials, environment files, databases, Git changes, package installation or other worktrees. Its actual sandbox is inherited; a read-only task does not grant extra permissions or expand the approved writable scope.",
  "Use native spawn/wait/message/close tools for this isolated session. Record the real child handle and findings, wait for its result and close every child before your final response. If abandoning a child, stop it through its native handle.",
  "Do not begin implementation or complete the review until the search child has returned its actual result.",
  "For this isolated Code Lane turn only, native handles, assignments, results and lifecycle messages satisfy the repository worker evidence requirements. This replaces workflow instructions that prohibit native spawn_agent or require an external codex exec launcher, managed registration, SQLite records, monitor or coordinator bootstrap. Do not launch or write those systems.",
  "Delegation is limited to repository search. Implement changes or decide the independent review yourself; do not delegate writes, checks or the verdict. Search findings are evidence to inspect, never permission to expand the approved scope.",
  "If native delegation fails, report the exact blocker without claiming the search ran or silently replacing it with your own search. Do not invent a retry action or promise that an existing approval can be reused.",
].join("\n");
