import * as migration_20260817_124443_baseline_core_schema from './20260817_124443_baseline_core_schema';
import * as migration_20260817_124449_realize_ai_readonly from './20260817_124449_realize_ai_readonly';
import * as migration_20260817_135658_conversation_idempotency from './20260817_135658_conversation_idempotency';
import * as migration_20260818_170919_approval_only_change_requests from './20260818_170919_approval_only_change_requests';
import * as migration_20260821_194623_isolated_execution_worker from './20260821_194623_isolated_execution_worker';
import * as migration_20260821_205949_local_preview_promotion from './20260821_205949_local_preview_promotion';

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
];
