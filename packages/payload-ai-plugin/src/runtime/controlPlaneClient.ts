/**
 * @file packages/payload-ai-plugin/src/runtime/controlPlaneClient.ts
 * @version 1.3.0
 * @date 2026-10-23
 * @description Передаёт серверные запросы и бинарные потоки авторизованному control plane.
 */

import type {
  ChatAssetMetadata,
  ChatCapabilitiesDto,
  ProjectContextFilesDto,
  ProjectContextFileDto,
  ProjectFileReference,
  ChatAssetReference,
} from "@realize/ai-contracts";
import type {
  StartControlPlaneRunInput,
  ControlPlaneRunStatus,
} from "./ControlPlaneChat.types";
import { ControlPlaneUnavailableError } from "./ControlPlaneUnavailable.error";
export type { StartControlPlaneRunInput } from "./ControlPlaneChat.types";
export { ControlPlaneUnavailableError } from "./ControlPlaneUnavailable.error";

/** Server-only authenticated client for run creation, cancellation and streaming. */
export class ControlPlaneClient {
  constructor(
    private readonly baseURL: string,
    private readonly token: string,
  ) {}

  async chatCapabilities(signal?: AbortSignal): Promise<ChatCapabilitiesDto> {
    return (
      await this.fetch("/v1/chat/capabilities", { method: "GET", signal })
    ).json();
  }
  async projectFiles(
    query: string,
    signal?: AbortSignal,
  ): Promise<ProjectContextFilesDto> {
    return (
      await this.fetch(
        `/v1/chat/project-files?q=${encodeURIComponent(query)}`,
        { method: "GET", signal },
      )
    ).json();
  }
  /** Защищённый relay ссылки источника; ACL проверяет Payload controller до server transport. */
  async projectFile(
    path: string,
    startLine: number,
    expectedSha256: string | undefined,
    developerInstructions: boolean,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const query = new URLSearchParams({
      path,
      startLine: String(startLine),
      developerInstructions: String(developerInstructions),
    });
    if (expectedSha256) query.set("expectedSha256", expectedSha256);
    return (
      await this.fetch(`/v1/chat/project-file?${query}`, {
        method: "GET",
        signal,
      })
    ).json();
  }
  async resolveProjectFiles(
    files: ProjectFileReference[],
  ): Promise<ProjectContextFileDto[]> {
    const response = await this.fetch("/v1/chat/project-files/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    return ((await response.json()) as { files: ProjectContextFileDto[] })
      .files;
  }
  async uploadChatAsset(
    file: File,
    signal?: AbortSignal,
  ): Promise<ChatAssetMetadata> {
    return (
      await this.fetch("/v1/chat/assets", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-Attachment-Name": encodeURIComponent(file.name),
        },
        body: file.stream(),
        duplex: "half",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000),
      })
    ).json();
  }
  async chatAssetMetadata(id: string): Promise<ChatAssetMetadata> {
    return (
      await this.fetch(`/v1/chat/assets/${encodeURIComponent(id)}`, {
        method: "GET",
      })
    ).json();
  }
  async downloadChatAsset(id: string, signal?: AbortSignal): Promise<Response> {
    return this.fetch(`/v1/chat/assets/${encodeURIComponent(id)}/file`, {
      method: "GET",
      signal,
    });
  }
  async deleteChatAsset(id: string): Promise<void> {
    await this.fetch(`/v1/chat/assets/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }
  async claimChatAsset(
    reference: ChatAssetReference,
    runID: string,
  ): Promise<void> {
    await this.fetch(
      `/v1/chat/assets/${encodeURIComponent(reference.id)}/claim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha256: reference.sha256, runID }),
      },
    );
  }

  async cancelRun(runID: string): Promise<void> {
    await this.fetch(`/v1/runs/${encodeURIComponent(runID)}/cancel`, {
      method: "POST",
    });
  }

  /** Проверяет фактический статус runtime, даже когда браузер не подключён к SSE. */
  async runStatus(runID: string): Promise<ControlPlaneRunStatus> {
    const response = await this.fetch(`/v1/runs/${encodeURIComponent(runID)}`, {
      method: "GET",
    });
    const invalid = () =>
      new ControlPlaneUnavailableError("Invalid control-plane run status.");
    if (!response.body) throw invalid();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8_192) {
          await reader.cancel();
          throw invalid();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw invalid();
    }
    if (!body || typeof body !== "object" || !("run" in body)) throw invalid();
    const run = body.run;
    if (
      !run ||
      typeof run !== "object" ||
      !("id" in run) ||
      run.id !== runID ||
      !("status" in run) ||
      !["queued", "running", "completed", "failed", "cancelled"].includes(
        String(run.status),
      )
    )
      throw invalid();
    return run.status as ControlPlaneRunStatus;
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

  /** Ответ остаётся unknown до проверяющего mapper владельца публичного контракта. */
  async ownerEngineeringStatus(): Promise<unknown> {
    return (
      await this.fetch("/v1/status", {
        method: "GET",
        signal: AbortSignal.timeout(2_000),
      })
    ).json();
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

  private async fetch(
    path: string,
    init: RequestInit & { duplex?: "half" },
  ): Promise<Response> {
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
        response.status,
      );
    }
    return response;
  }
}
