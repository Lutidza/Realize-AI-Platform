/**
 * @file .ai/tools/git-delivery/src/worker/gitWorker.config.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Задаёт ограничения Codex для локальных Git-воркеров.
 */

export const GIT_WORKER_CONFIG = {
  model_provider: "openai",
  approval_policy: "never",
  sandbox_mode: "read-only",
  web_search: "disabled",
  project_doc_max_bytes: 0,
  notify: [],
  mcp_servers: {},
  plugins: {},
  "tools.update_plan.enabled": false,
  "tools.experimental_request_user_input.enabled": false,
  "skills.include_instructions": false,
  "agents.enabled": false,
  "memories.generate_memories": false,
  "memories.use_memories": false,
  "features.shell_tool": false,
  "features.unified_exec": false,
  "features.shell_snapshot": false,
  "features.apply_patch_freeform": false,
  "features.apps": false,
  "features.plugins": false,
  "features.hooks": false,
  "features.codex_hooks": false,
  "features.plugin_hooks": false,
  "features.multi_agent": false,
  "features.multi_agent_v2": false,
  "features.code_mode": false,
  "features.js_repl": false,
  "features.browser_use": false,
  "features.computer_use": false,
  "features.image_generation": false,
  "features.view_image": false,
  "features.memories": false,
  "features.memory_tool": false,
  "features.request_permissions": false,
  "features.request_permissions_tool": false,
  "features.goals": false,
  "features.sleep_tool": false,
  "features.skill_search": false,
  "features.tool_search": false,
  "features.skip_host_skill_discovery": true,
};
