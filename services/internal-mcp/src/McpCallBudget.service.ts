/**
 * @file services/internal-mcp/src/McpCallBudget.service.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Ограничивает частоту и фактически незавершённые вызовы каждого principal.
 */
import type { McpLimits } from "../../../packages/ai-contracts/src/McpServer.types";
import { McpError } from "./Mcp.error";
export class McpCallBudget {
  private total = 0;
  private readonly principals = new Map<
    string,
    { tokens: number; at: number; active: number; searching: boolean }
  >();

  /** Release вызывается только после фактического окончания операции, включая отменённую. */
  acquire(
    principal: string,
    limits: McpLimits,
    searching: boolean,
  ): () => void {
    const now = Date.now();
    for (const [key, state] of this.principals)
      if (!state.active && now - state.at > 600000) this.principals.delete(key);
    if (!this.principals.has(principal) && this.principals.size >= 10000)
      throw new McpError("RATE_LIMITED", "Лимит активных клиентов исчерпан.");
    const state = this.principals.get(principal) ?? {
      tokens: limits.burst,
      at: now,
      active: 0,
      searching: false,
    };
    state.tokens = Math.min(
      limits.burst,
      state.tokens + ((now - state.at) * limits.callsPerMinute) / 60000,
    );
    state.at = now;
    this.principals.set(principal, state);
    if (
      this.total >= 8 ||
      state.active >= limits.concurrentCalls ||
      state.tokens < 1 ||
      (searching && state.searching)
    )
      throw new McpError(
        "RATE_LIMITED",
        "Лимит вызовов исчерпан; повторите позже.",
      );
    state.tokens--;
    state.active++;
    this.total++;
    if (searching) state.searching = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      state.active--;
      this.total--;
      if (searching) state.searching = false;
    };
  }
}
