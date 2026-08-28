/**
 * @file services/ai-execution-worker/src/releaseOrchestrator.ts
 * @version 2026-08-27
 * @description Запускает OCI orchestrator с ограниченным per-call environment overlay.
 */

import { spawn } from "node:child_process";

import type { ExecutionWorkerConfig } from "./config";
import type {
  ReleaseOrchestratorInput,
  ReleaseOrchestratorResult,
} from "./releaseTypes";

const MAX_OUTPUT_BYTES = 1_000_000;

/** Ошибка недоверенного результата или запуска внешнего orchestrator. */
export class ReleaseOrchestratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseOrchestratorError";
  }
}

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReleaseOrchestratorError(
      "Release orchestrator output must be a JSON object.",
    );
  }
  return value as Record<string, unknown>;
};

const requiredString = (
  value: unknown,
  name: string,
  maximum = 2_000,
): string => {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new ReleaseOrchestratorError(`${name} is invalid.`);
  }
  return value;
};

const optionalString = (value: unknown, name: string): string | undefined =>
  value === undefined ? undefined : requiredString(value, name);

const migrations = (
  value: unknown,
): ReleaseOrchestratorResult["migrations"] => {
  if (!Array.isArray(value) || value.length > 500) {
    throw new ReleaseOrchestratorError("migrations must be a bounded array.");
  }
  return value.map((item) => {
    const migration = asObject(item);
    if (migration.direction !== "up") {
      throw new ReleaseOrchestratorError("Migration direction must be up.");
    }
    return {
      checksum: requiredString(migration.checksum, "migration checksum", 64),
      direction: "up",
      id: requiredString(migration.id, "migration id", 200),
    };
  });
};

const pluginVersions = (value: unknown): Record<string, string> => {
  const source = asObject(value);
  const entries = Object.entries(source);
  if (entries.length === 0 || entries.length > 200) {
    throw new ReleaseOrchestratorError(
      "pluginVersions must contain between 1 and 200 entries.",
    );
  }
  return Object.fromEntries(
    entries.map(([name, version]) => [
      requiredString(name, "plugin name", 200),
      requiredString(version, "plugin version", 200),
    ]),
  );
};

/** Парсит единственный разрешённый schema version результата orchestrator. */
export const parseReleaseOrchestratorResult = (
  value: unknown,
): ReleaseOrchestratorResult => {
  const source = asObject(value);
  if (source.schemaVersion !== 1) {
    throw new ReleaseOrchestratorError(
      "Release orchestrator schemaVersion must be 1.",
    );
  }
  if (source.previewStatus !== "healthy") {
    throw new ReleaseOrchestratorError(
      "Release orchestrator previewStatus must be healthy.",
    );
  }
  if (source.signatureVerified !== true) {
    throw new ReleaseOrchestratorError(
      "Release orchestrator must verify the image signature.",
    );
  }
  return {
    configVersion: requiredString(source.configVersion, "configVersion", 200),
    gitCommit: requiredString(source.gitCommit, "gitCommit", 40),
    healthSummary: requiredString(source.healthSummary, "healthSummary", 4_000),
    imageDigest: requiredString(source.imageDigest, "imageDigest", 71),
    imageRef: requiredString(source.imageRef, "imageRef"),
    manifestHash: requiredString(source.manifestHash, "manifestHash", 64),
    migrations: migrations(source.migrations),
    migrationSetHash: requiredString(
      source.migrationSetHash,
      "migrationSetHash",
      64,
    ),
    orchestratorReference: optionalString(
      source.orchestratorReference,
      "orchestratorReference",
    ),
    pluginVersions: pluginVersions(source.pluginVersions),
    previewStatus: "healthy",
    previewURL: requiredString(source.previewURL, "previewURL"),
    provenanceRef: requiredString(source.provenanceRef, "provenanceRef"),
    sbomDigest: requiredString(source.sbomDigest, "sbomDigest", 71),
    schemaVersion: 1,
    signatureRef: requiredString(source.signatureRef, "signatureRef"),
    signatureVerified: true,
  };
};

/** Передаёт JSON через stdin и принимает ровно один JSON result через stdout. */
export const runReleaseOrchestrator = async (input: {
  config: ExecutionWorkerConfig;
  environment?: Record<string, string | undefined>;
  request: ReleaseOrchestratorInput;
}): Promise<ReleaseOrchestratorResult> => {
  const command = input.config.releaseOrchestratorCommand;
  if (!command) {
    throw new ReleaseOrchestratorError(
      "Release orchestrator command is not configured.",
    );
  }
  return await new Promise<ReleaseOrchestratorResult>((resolve, reject) => {
    const child = spawn(command, input.config.releaseOrchestratorArgs, {
      cwd: input.config.repositoryRoot,
      env: {
        ...input.config.releaseOrchestratorEnvironment,
        ...input.environment,
      },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let settled = false;
    let stdout = "";
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() =>
        reject(new ReleaseOrchestratorError("Release orchestrator timed out.")),
      );
    }, input.config.releaseTimeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(() =>
          reject(
            new ReleaseOrchestratorError(
              "Release orchestrator stdout exceeded the limit.",
            ),
          ),
        );
      }
    });
    child.stderr.resume();
    child.stdin.on("error", () =>
      finish(() =>
        reject(
          new ReleaseOrchestratorError(
            "Release orchestrator did not accept its JSON request.",
          ),
        ),
      ),
    );
    child.on("error", () =>
      finish(() =>
        reject(
          new ReleaseOrchestratorError(
            "Release orchestrator could not be started.",
          ),
        ),
      ),
    );
    child.on("close", (code, signal) => {
      finish(() => {
        if (code !== 0) {
          reject(
            new ReleaseOrchestratorError(
              `Release orchestrator failed (${code ?? signal ?? "unknown"}).`,
            ),
          );
          return;
        }
        try {
          resolve(parseReleaseOrchestratorResult(JSON.parse(stdout)));
        } catch (error) {
          reject(
            error instanceof ReleaseOrchestratorError
              ? error
              : new ReleaseOrchestratorError(
                  "Release orchestrator returned invalid JSON.",
                ),
          );
        }
      });
    });
    child.stdin.end(`${JSON.stringify(input.request)}\n`);
  });
};
