/**
 * @file packages/payload-ai-plugin/src/admin/RunInspector.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Показывает фактическую конфигурацию запуска, соединение и использование ресурсов.
 */

import type { RunDTO, RuntimeStatusDTO } from "@realize/ai-contracts";
import { Activity, ShieldCheck } from "lucide-react";

import styles from "./RunInspector.module.css";
import { formatRunElapsed, runPhaseLabel } from "./runPresentation";
import type { RunStreamState } from "./runStreamTypes";

type RunInspectorProps = {
  run?: RunDTO;
  runtime?: RuntimeStatusDTO;
  stream: RunStreamState;
};

/** Renders the read-only diagnostics owner for the current assistant run. */
export const RunInspector = ({ run, runtime, stream }: RunInspectorProps) => (
  <aside className={styles.inspector}>
    <h2>
      <Activity size={16} />
      Текущий запуск
    </h2>
    <dl>
      {run?.agentConfiguration && (
        <div>
          <dt>Профиль</dt>
          <dd>
            {run.agentConfiguration.profileTitle ||
              run.agentConfiguration.profileKey}{" "}
            · выпуск {run.agentConfiguration.releaseVersion}
          </dd>
        </div>
      )}
      <div>
        <dt>Режим</dt>
        <dd>{runtime?.mode || "—"}</dd>
      </div>
      <div>
        <dt>Sandbox</dt>
        <dd>analysis-readonly</dd>
      </div>
      <div>
        <dt>Статус</dt>
        <dd>{run?.status || "нет запуска"}</dd>
      </div>
      <div>
        <dt>Соединение</dt>
        <dd>{run ? runPhaseLabel(stream.phase) : "—"}</dd>
      </div>
      <div>
        <dt>Время</dt>
        <dd>{run ? formatRunElapsed(stream.elapsedSeconds) : "—"}</dd>
      </div>
      <div>
        <dt>Активность</dt>
        <dd>{stream.toolSummary || "—"}</dd>
      </div>
      <div>
        <dt>Токены</dt>
        <dd>{stream.usage?.totalTokens ?? run?.usage?.totalTokens ?? "—"}</dd>
      </div>
    </dl>
    <div className={styles.guardrails}>
      <strong>
        <ShieldCheck size={15} />
        Ограничения
      </strong>
      <ul>
        <li>нет записи в Git и Payload;</li>
        <li>нет MCP и web search;</li>
        <li>нет production credentials;</li>
        <li>
          chat-run остаётся read-only; code execution живёт отдельным job.
        </li>
      </ul>
    </div>
  </aside>
);
