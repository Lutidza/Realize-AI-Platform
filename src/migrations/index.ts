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
    name: '20260914_083749_page_publication_operations'
  },
];
