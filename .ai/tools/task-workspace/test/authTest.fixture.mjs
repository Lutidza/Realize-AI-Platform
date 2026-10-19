/**
 * @file .ai/tools/task-workspace/test/authTest.fixture.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Предоставляет изолированные clock/keyring/HTTP зависимости CLI auth без настоящих credentials.
 * @see documentation/architecture/platform-access.md
 */
import assert from "node:assert/strict";
import { WorkspaceError } from "../src/Workspace.error.mjs";

export const baseUrl = "https://example.test/api/task-manager";
export const tokenId = "11111111-1111-4111-8111-111111111111";
export const epoch = Date.parse("2026-10-19T12:00:00.000Z");
/** @param {number} [accessSeconds] @param {string} [secret] @returns {import('@realize/payload-access-management/contracts').CredentialBundle} */
export function credential(accessSeconds = 900, secret = "a") {
  const createdAt = new Date(epoch).toISOString();
  const expiresAt = new Date(epoch + 90 * 86400000).toISOString();
  const accessExpiresAt = new Date(epoch + accessSeconds * 1000).toISOString();
  return {
    accessToken: `rza.${tokenId}.${secret.repeat(43)}`,
    refreshToken: `rzr.${tokenId}.${secret.repeat(43)}`,
    accessExpiresAt,
    expiresAt,
    actor: { id: "7", name: "Test administrator" },
    token: {
      id: tokenId,
      name: "Test CLI",
      kind: "cli",
      ownerId: "7",
      scopes: [
        "task-manager:read",
        "task-manager:write",
        "task-manager:projects",
      ],
      prefix: `rza.${tokenId}`,
      createdAt,
      expiresAt,
      accessExpiresAt,
      lastUsedAt: null,
      revokedAt: null,
      status: "active",
    },
  };
}
export const start = {
  deviceCode: `rzd.${tokenId}.${"z".repeat(43)}`,
  userCode: "ABCD-EFGH",
  verificationUri: "https://example.test/system/access/device",
  expiresIn: 600,
  interval: 5,
};
/** @param {unknown} data */
export const response = (data) => ({ ok: true, data });
/** @param {string} code */
export const codeIs = (code) => (/** @type {unknown} */ error) =>
  error instanceof WorkspaceError && error.code === code;

export function fixture() {
  /** @type {Map<string,import('@realize/payload-access-management/contracts').CredentialBundle>} */ const stored =
    new Map();
  /** @type {string|null} */ let selected = null;
  let now = epoch;
  /** @type {string[]} */ const events = [];
  /** @type {number[]} */ const waits = [];
  const pending = new Set();
  let queue = Promise.resolve();
  /** @type {import('../src/auth/Auth.types').AuthDependencies} */
  const deps = {
    env: {},
    config: {
      read: () => selected,
      write: (url) => {
        selected = url;
        events.push("config");
      },
    },
    refreshState: {
      pending: (url) => pending.has(url),
      begin: (url) => {
        pending.add(url);
        events.push("begin");
      },
      finish: (url) => {
        pending.delete(url);
        events.push("finish");
      },
    },
    keyring: {
      probe: async () => {
        events.push("probe");
      },
      read: async (url) => stored.get(url) ?? null,
      write: async (url, value) => {
        stored.set(url, value);
        events.push("save");
      },
      remove: async (url) => {
        stored.delete(url);
        events.push("remove");
      },
    },
    withLock: async (url, operation) => {
      assert.match(url, /^https?:\/\//);
      const previous = queue;
      /** @type {()=>void} */ let release = () => {};
      queue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await operation();
      } finally {
        release();
      }
    },
    transport: async () => {
      throw new Error("unconfigured test transport");
    },
    now: () => now,
    sleep: async (ms, signal) => {
      if (signal?.aborted) throw new WorkspaceError("auth_cancelled");
      waits.push(ms);
      now += ms;
    },
    notice: (value) => {
      assert.equal(value.userCode, start.userCode);
      events.push("notice");
    },
    openBrowser: async () => {
      events.push("browser");
      return true;
    },
  };
  return {
    deps,
    stored,
    events,
    waits,
    pending,
    select: (/** @type {string} */ url) => {
      selected = url;
    },
    selected: () => selected,
    advance: (/** @type {number} */ ms) => {
      now += ms;
    },
  };
}
