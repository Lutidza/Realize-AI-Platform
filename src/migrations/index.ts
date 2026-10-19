import * as migration_20260817_124443_baseline_core_schema from './20260817_124443_baseline_core_schema';
import * as migration_20260817_124449_realize_ai_readonly from './20260817_124449_realize_ai_readonly';
import * as migration_20260817_135658_conversation_idempotency from './20260817_135658_conversation_idempotency';
import * as migration_20260818_170919_approval_only_change_requests from './20260818_170919_approval_only_change_requests';
import * as migration_20260821_194623_isolated_execution_worker from './20260821_194623_isolated_execution_worker';
import * as migration_20260821_205949_local_preview_promotion from './20260821_205949_local_preview_promotion';
import * as migration_20260822_092506_release_candidate_approval from './20260822_092506_release_candidate_approval';
import * as migration_20260827_070003_admin_integration_registry from './20260827_070003_admin_integration_registry';
import * as migration_20260828_022809_github_pull_request_source_promotion from './20260828_022809_github_pull_request_source_promotion';
import * as migration_20260828_044410_data_operation_lane from './20260828_044410_data_operation_lane';
import * as migration_20260901_163832_ai_config_persistence from './20260901_163832_ai_config_persistence';
import * as migration_20260909_190959_chat_message_context from './20260909_190959_chat_message_context';
import * as migration_20260910_122259_ai_config_activation from './20260910_122259_ai_config_activation';
import * as migration_20260911_132139_worker_presence from './20260911_132139_worker_presence';
import * as migration_20260911_155718_page_draft_data_operation from './20260911_155718_page_draft_data_operation';
import * as migration_20260912_111003_page_draft_update from './20260912_111003_page_draft_update';
import * as migration_20260913_184706_page_structure_draft_operation from './20260913_184706_page_structure_draft_operation';
import * as migration_20260914_083749_page_publication_operations from './20260914_083749_page_publication_operations';
import * as migration_20260915_080818_media_processing_profiles from './20260915_080818_media_processing_profiles';
import * as migration_20260915_082031_media_nullable_backlinks from './20260915_082031_media_nullable_backlinks';
import * as migration_20260923_120805_internal_mcp from './20260923_120805_internal_mcp';
import * as migration_20260925_093817_chatgpt_tunnel_status from './20260925_093817_chatgpt_tunnel_status';
import * as migration_20260925_133735_design_workshop from './20260925_133735_design_workshop';
import * as migration_20260925_170325_design_preview from './20260925_170325_design_preview';
import * as migration_20260926_112722_workshop_mcp from './20260926_112722_workshop_mcp';
import * as migration_20260927_070914_search_observations from './20260927_070914_search_observations';
import * as migration_20260928_102009_search_observation_state from './20260928_102009_search_observation_state';
import * as migration_20261004_161914_ai_execution_context from './20261004_161914_ai_execution_context';
import * as migration_20261004_210727_ai_usage_ledger from './20261004_210727_ai_usage_ledger';
import * as migration_20261011_162630_task_manager_foundation from './20261011_162630_task_manager_foundation';
import * as migration_20261011_215235_task_git_sync from './20261011_215235_task_git_sync';
import * as migration_20261012_094626_extension_manager_state from './20261012_094626_extension_manager_state';
import * as migration_20261019_065606_task_workspace_intake from './20261019_065606_task_workspace_intake';
import * as migration_20261019_085743_platform_access from './20261019_085743_platform_access';

export const migrations = [
  {
    up: migration_20260817_124443_baseline_core_schema.up,
    down: migration_20260817_124443_baseline_core_schema.down,
    name: '20260817_124443_baseline_core_schema',
  },
  {
    up: migration_20260817_124449_realize_ai_readonly.up,
    down: migration_20260817_124449_realize_ai_readonly.down,
    name: '20260817_124449_realize_ai_readonly',
  },
  {
    up: migration_20260817_135658_conversation_idempotency.up,
    down: migration_20260817_135658_conversation_idempotency.down,
    name: '20260817_135658_conversation_idempotency',
  },
  {
    up: migration_20260818_170919_approval_only_change_requests.up,
    down: migration_20260818_170919_approval_only_change_requests.down,
    name: '20260818_170919_approval_only_change_requests',
  },
  {
    up: migration_20260821_194623_isolated_execution_worker.up,
    down: migration_20260821_194623_isolated_execution_worker.down,
    name: '20260821_194623_isolated_execution_worker',
  },
  {
    up: migration_20260821_205949_local_preview_promotion.up,
    down: migration_20260821_205949_local_preview_promotion.down,
    name: '20260821_205949_local_preview_promotion',
  },
  {
    up: migration_20260822_092506_release_candidate_approval.up,
    down: migration_20260822_092506_release_candidate_approval.down,
    name: '20260822_092506_release_candidate_approval',
  },
  {
    up: migration_20260827_070003_admin_integration_registry.up,
    down: migration_20260827_070003_admin_integration_registry.down,
    name: '20260827_070003_admin_integration_registry',
  },
  {
    up: migration_20260828_022809_github_pull_request_source_promotion.up,
    down: migration_20260828_022809_github_pull_request_source_promotion.down,
    name: '20260828_022809_github_pull_request_source_promotion',
  },
  {
    up: migration_20260828_044410_data_operation_lane.up,
    down: migration_20260828_044410_data_operation_lane.down,
    name: '20260828_044410_data_operation_lane',
  },
  {
    up: migration_20260901_163832_ai_config_persistence.up,
    down: migration_20260901_163832_ai_config_persistence.down,
    name: '20260901_163832_ai_config_persistence',
  },
  {
    up: migration_20260909_190959_chat_message_context.up,
    down: migration_20260909_190959_chat_message_context.down,
    name: '20260909_190959_chat_message_context',
  },
  {
    up: migration_20260910_122259_ai_config_activation.up,
    down: migration_20260910_122259_ai_config_activation.down,
    name: '20260910_122259_ai_config_activation',
  },
  {
    up: migration_20260911_132139_worker_presence.up,
    down: migration_20260911_132139_worker_presence.down,
    name: '20260911_132139_worker_presence',
  },
  {
    up: migration_20260911_155718_page_draft_data_operation.up,
    down: migration_20260911_155718_page_draft_data_operation.down,
    name: '20260911_155718_page_draft_data_operation',
  },
  {
    up: migration_20260912_111003_page_draft_update.up,
    down: migration_20260912_111003_page_draft_update.down,
    name: '20260912_111003_page_draft_update',
  },
  {
    up: migration_20260913_184706_page_structure_draft_operation.up,
    down: migration_20260913_184706_page_structure_draft_operation.down,
    name: '20260913_184706_page_structure_draft_operation',
  },
  {
    up: migration_20260914_083749_page_publication_operations.up,
    down: migration_20260914_083749_page_publication_operations.down,
    name: '20260914_083749_page_publication_operations',
  },
  {
    up: migration_20260915_080818_media_processing_profiles.up,
    down: migration_20260915_080818_media_processing_profiles.down,
    name: '20260915_080818_media_processing_profiles',
  },
  {
    up: migration_20260915_082031_media_nullable_backlinks.up,
    down: migration_20260915_082031_media_nullable_backlinks.down,
    name: '20260915_082031_media_nullable_backlinks',
  },
  {
    up: migration_20260923_120805_internal_mcp.up,
    down: migration_20260923_120805_internal_mcp.down,
    name: '20260923_120805_internal_mcp',
  },
  {
    up: migration_20260925_093817_chatgpt_tunnel_status.up,
    down: migration_20260925_093817_chatgpt_tunnel_status.down,
    name: '20260925_093817_chatgpt_tunnel_status',
  },
  {
    up: migration_20260925_133735_design_workshop.up,
    down: migration_20260925_133735_design_workshop.down,
    name: '20260925_133735_design_workshop',
  },
  {
    up: migration_20260925_170325_design_preview.up,
    down: migration_20260925_170325_design_preview.down,
    name: '20260925_170325_design_preview',
  },
  {
    up: migration_20260926_112722_workshop_mcp.up,
    down: migration_20260926_112722_workshop_mcp.down,
    name: '20260926_112722_workshop_mcp',
  },
  {
    up: migration_20260927_070914_search_observations.up,
    down: migration_20260927_070914_search_observations.down,
    name: '20260927_070914_search_observations',
  },
  {
    up: migration_20260928_102009_search_observation_state.up,
    down: migration_20260928_102009_search_observation_state.down,
    name: '20260928_102009_search_observation_state',
  },
  {
    up: migration_20261004_161914_ai_execution_context.up,
    down: migration_20261004_161914_ai_execution_context.down,
    name: '20261004_161914_ai_execution_context',
  },
  {
    up: migration_20261004_210727_ai_usage_ledger.up,
    down: migration_20261004_210727_ai_usage_ledger.down,
    name: '20261004_210727_ai_usage_ledger',
  },
  {
    up: migration_20261011_162630_task_manager_foundation.up,
    down: migration_20261011_162630_task_manager_foundation.down,
    name: '20261011_162630_task_manager_foundation',
  },
  {
    up: migration_20261011_215235_task_git_sync.up,
    down: migration_20261011_215235_task_git_sync.down,
    name: '20261011_215235_task_git_sync',
  },
  {
    up: migration_20261012_094626_extension_manager_state.up,
    down: migration_20261012_094626_extension_manager_state.down,
    name: '20261012_094626_extension_manager_state',
  },
  {
    up: migration_20261019_065606_task_workspace_intake.up,
    down: migration_20261019_065606_task_workspace_intake.down,
    name: '20261019_065606_task_workspace_intake',
  },
  {
    up: migration_20261019_085743_platform_access.up,
    down: migration_20261019_085743_platform_access.down,
    name: '20261019_085743_platform_access'
  },
];
