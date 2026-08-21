/**
 * @file packages/payload-ai-plugin/src/runtime/controlPlaneClient.ts
 * @version 2026-08-17
 * @description Implements the bounded server-only HTTP client for the configured AI control plane.
 */

/** Validated request sent from the site boundary to the control plane. */
export type StartControlPlaneRunInput = {
  model?: string;
  prompt: string;
  runID: string;
  threadID?: string;
};

/** Stable local error used when the remote execution boundary is unavailable. */
export class ControlPlaneUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlPlaneUnavailableError";
  }
}

/** Server-only authenticated client for run creation, cancellation and streaming. */
export class ControlPlaneClient {
  constructor(
    private readonly baseURL: string,
    private readonly token: string,
  ) {}

  async cancelRun(runID: string): Promise<void> {
    await this.fetch(`/v1/runs/${encodeURIComponent(runID)}/cancel`, {
      method: "POST",
    });
  }

  async health(): Promise<boolean> {
    try {
      await this.fetch("/v1/status", {
        method: "GET",
        signal: AbortSignal.timeout(2_000),
      });
      return true;
    } catch {
      return false;
    }
  }

  async startRun(input: StartControlPlaneRunInput): Promise<void> {
    await this.fetch("/v1/runs", {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  async streamRun(
    runID: string,
    afterSequence: number,
    signal: AbortSignal,
  ): Promise<Response> {
    return await this.fetch(
      `/v1/runs/${encodeURIComponent(runID)}/events?after=${afterSequence}`,
      {
        headers: { Accept: "text/event-stream" },
        method: "GET",
        signal,
      },
    );
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    if (!this.baseURL || !this.token) {
      throw new ControlPlaneUnavailableError(
        "Control plane is not configured.",
      );
    }

    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseURL), {
        ...init,
        cache: "no-store",
        headers: {
          ...init.headers,
          Authorization: `Bearer ${this.token}`,
        },
        signal: init.signal ?? AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ControlPlaneUnavailableError("Control plane is unreachable.");
    }

    if (!response.ok) {
      throw new ControlPlaneUnavailableError(
        `Control plane returned HTTP ${response.status}.`,
      );
    }
    return response;
  }
}
