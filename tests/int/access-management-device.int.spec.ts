/**
 * @file tests/int/access-management-device.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет consent, single-consume, bounded throttle, refresh reuse и отмену CLI credential.
 * @see documentation/architecture/platform-access.md
 */
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessFixture } from "./access-management.fixture";
import { AccessDeviceService } from "../../packages/payload-access-management/src/server/AccessDevice.service";
import { AccessCredentialService } from "../../packages/payload-access-management/src/server/AccessCredential.service";
import { authenticateAccessRequest } from "../../packages/payload-access-management/src/server/authenticateAccessRequest.service";
import { credentialBundleSchema } from "../../packages/payload-access-management/src/contracts/access.schemas";
import {
  ACCESS_CREDENTIALS_SLUG,
  ACCESS_DEVICES_SLUG,
  ACCESS_REFRESH_HISTORY_SLUG,
} from "../../packages/payload-access-management/src/accessManagement.constants";

const startInput = {
  clientName: "Рабочий терминал",
  scopes: ["task-manager:read", "task-manager:write"],
};
async function connection() {
  const fixture = accessFixture();
  const device = new AccessDeviceService(fixture.request(), fixture.options);
  const started = await device.start(startInput);
  await device.decide({ userCode: started.userCode, decision: "approve" });
  const issued = await device.poll(started.deviceCode);
  return {
    ...fixture,
    device,
    started,
    credential: issued.credential!,
    sessions: new AccessCredentialService(fixture.request(), fixture.options),
  };
}
afterEach(() => vi.useRealTimers());
describe("device authorization and refresh security", () => {
  it("keeps GET side effect free for consent and exposes neither device secret nor hashes", async () => {
    const fixture = accessFixture();
    const service = new AccessDeviceService(fixture.request(), fixture.options);
    const started = await service.start(startInput);
    expect(started.verificationUri).toBe(
      "https://realize.example/system/access/device",
    );
    expect(started.verificationUri).not.toContain(started.deviceCode);
    const read = await service.read(started.userCode);
    expect(read.status).toBe("pending");
    expect(JSON.stringify(read)).not.toMatch(
      /deviceHash|deviceCode|credential/,
    );
    const pending = await service.poll(started.deviceCode);
    expect(pending).toEqual({
      status: "authorization_pending",
      interval: 5,
      credential: null,
    });
    expect(fixture.rows.get(ACCESS_CREDENTIALS_SLUG)).toBeUndefined();
    expect(JSON.stringify([...fixture.rows])).not.toContain(started.deviceCode);
  });
  it("requires owner-bound consent and emits the secret only on one successful consume", async () => {
    const fixture = await connection();
    expect(credentialBundleSchema.parse(fixture.credential)).toEqual(
      fixture.credential,
    );
    expect(fixture.credential.token.kind).toBe("cli");
    const expires =
      Date.parse(fixture.credential.expiresAt) -
      Date.parse(fixture.credential.token.createdAt);
    expect(expires).toBe(90 * 86400000);
    expect(
      Date.parse(fixture.credential.accessExpiresAt) -
        Date.parse(fixture.credential.token.createdAt),
    ).toBe(900000);
    expect(await fixture.device.poll(fixture.started.deviceCode)).toMatchObject(
      { status: "consumed", credential: null },
    );
    expect(fixture.rows.get(ACCESS_CREDENTIALS_SLUG)).toHaveLength(1);
    const other = new AccessDeviceService(
      fixture.request("/api/access", {}, 2),
      fixture.options,
    );
    await expect(other.read(fixture.started.userCode)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      other.decide({ userCode: fixture.started.userCode, decision: "approve" }),
    ).rejects.toMatchObject({ status: 404 });
    const stored = JSON.stringify([...fixture.rows]);
    expect(stored).not.toContain(fixture.credential.accessToken);
    expect(stored).not.toContain(fixture.credential.refreshToken);
  });
  it("enforces denial, expiration and changed admission before exchange", async () => {
    const fixture = accessFixture();
    const device = new AccessDeviceService(fixture.request(), fixture.options);
    const denied = await device.start(startInput);
    await device.decide({ userCode: denied.userCode, decision: "deny" });
    expect(await device.poll(denied.deviceCode)).toMatchObject({
      status: "access_denied",
      credential: null,
    });
    const expired = await device.start(startInput);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 601000);
    expect(await device.poll(expired.deviceCode)).toMatchObject({
      status: "expired_token",
    });
    expect((await device.read(expired.userCode)).status).toBe("expired");
    vi.useRealTimers();
    const changed = await device.start(startInput);
    await device.decide({ userCode: changed.userCode, decision: "approve" });
    fixture.rows.get("users")![0].roles = [];
    expect(await device.poll(changed.deviceCode)).toMatchObject({
      status: "access_denied",
    });
    expect(fixture.rows.get(ACCESS_CREDENTIALS_SLUG)).toBeUndefined();
  });
  it("increases polling interval, limits global live requests and persists rate-limit accounting", async () => {
    const fixture = accessFixture();
    const device = new AccessDeviceService(fixture.request(), fixture.options);
    const started = await device.start(startInput);
    await device.poll(started.deviceCode);
    expect(await device.poll(started.deviceCode)).toMatchObject({
      status: "slow_down",
      interval: 10,
    });
    expect(await device.poll(started.deviceCode)).toMatchObject({
      status: "slow_down",
      interval: 15,
    });
    for (let i = 0; i < 19; i++) await device.start(startInput);
    for (let i = 0; i < 3; i++)
      await expect(device.start(startInput)).rejects.toMatchObject({
        status: 429,
      });
    expect(fixture.rows.get(ACCESS_DEVICES_SLUG)).toHaveLength(20);
    vi.useFakeTimers();
    for (let minute = 1; minute <= 4; minute++) {
      vi.setSystemTime(Date.now() + 61000);
      for (let i = 0; i < 20; i++) await device.start(startInput);
    }
    vi.setSystemTime(Date.now() + 61000);
    await expect(device.start(startInput)).rejects.toMatchObject({
      status: 429,
    });
    expect(fixture.rows.get(ACCESS_DEVICES_SLUG)).toHaveLength(100);
  });
  it("limits user-code guesses per real actor without granting access from the short code", async () => {
    const fixture = accessFixture();
    const device = new AccessDeviceService(fixture.request(), fixture.options);
    for (let i = 0; i < 20; i++)
      await expect(device.read("ABCD-EFGH")).rejects.toMatchObject({
        status: 404,
      });
    await expect(device.read("ABCD-EFGH")).rejects.toMatchObject({
      status: 429,
    });
    await expect(device.poll("ABCD-EFGH")).rejects.toMatchObject({
      status: 401,
    });
    const other = new AccessDeviceService(
      fixture.request("/api/access", {}, 2),
      fixture.options,
    );
    await expect(other.read("ABCD-EFGH")).rejects.toMatchObject({
      status: 404,
    });
  });
  it("cancels pending requests and revokes an already consumed credential within device TTL", async () => {
    const fixture = await connection();
    expect(await fixture.device.cancel(fixture.started.deviceCode)).toEqual({
      cancelled: true,
    });
    expect(await fixture.device.cancel(fixture.started.deviceCode)).toEqual({
      cancelled: true,
    });
    const req = fixture.request(
      "/api/task-manager/projects",
      {
        headers: { authorization: `Bearer ${fixture.credential.accessToken}` },
      },
      null,
    );
    await expect(
      authenticateAccessRequest(req, fixture.options, "task-manager:read"),
    ).rejects.toMatchObject({ status: 401 });
    const pending = await fixture.device.start(startInput);
    await fixture.device.cancel(pending.deviceCode);
    expect(await fixture.device.poll(pending.deviceCode)).toMatchObject({
      status: "access_denied",
    });
  });
  it("rotates both credentials, preserves absolute expiry and rejects the old bearer immediately", async () => {
    const fixture = await connection();
    const refreshed = await fixture.sessions.refresh(
      fixture.credential.refreshToken,
    );
    expect(refreshed.expiresAt).toBe(fixture.credential.expiresAt);
    expect(refreshed.accessToken).not.toBe(fixture.credential.accessToken);
    expect(refreshed.refreshToken).not.toBe(fixture.credential.refreshToken);
    expect(fixture.rows.get(ACCESS_REFRESH_HISTORY_SLUG)).toHaveLength(1);
    const old = fixture.request(
      "/api/task-manager/projects",
      {
        headers: { authorization: `Bearer ${fixture.credential.accessToken}` },
      },
      null,
    );
    await expect(
      authenticateAccessRequest(old, fixture.options, "task-manager:read"),
    ).rejects.toMatchObject({ status: 401 });
    const current = fixture.request(
      "/api/task-manager/projects",
      { headers: { authorization: `Bearer ${refreshed.accessToken}` } },
      null,
    );
    expect(
      await authenticateAccessRequest(
        current,
        fixture.options,
        "task-manager:read",
      ),
    ).toMatchObject({ actor: { id: "1" } });
  });
  it("commits revocation after reuse of any retired refresh without storing replay secrets", async () => {
    const fixture = await connection();
    const second = await fixture.sessions.refresh(
      fixture.credential.refreshToken,
    );
    const third = await fixture.sessions.refresh(second.refreshToken);
    await expect(
      fixture.sessions.refresh(fixture.credential.refreshToken),
    ).rejects.toMatchObject({ status: 401 });
    const persisted = fixture.rows.get(ACCESS_CREDENTIALS_SLUG)![0].record as {
      revokedAt: string | null;
    };
    expect(persisted.revokedAt).not.toBeNull();
    await expect(
      fixture.sessions.refresh(third.refreshToken),
    ).rejects.toMatchObject({ status: 401 });
    const stored = JSON.stringify([...fixture.rows]);
    for (const bundle of [fixture.credential, second, third]) {
      expect(stored).not.toContain(bundle.accessToken);
      expect(stored).not.toContain(bundle.refreshToken);
    }
  });
  it("does not revoke on an unknown refresh, and supports idempotent logout using a previous refresh", async () => {
    const fixture = await connection();
    const fake = fixture.credential.refreshToken.slice(0, -43) + "a".repeat(43);
    await expect(fixture.sessions.refresh(fake)).rejects.toMatchObject({
      status: 401,
    });
    const next = await fixture.sessions.refresh(
      fixture.credential.refreshToken,
    );
    expect(
      await fixture.sessions.logout(fixture.credential.refreshToken),
    ).toEqual({ revoked: true });
    expect(await fixture.sessions.logout(next.refreshToken)).toEqual({
      revoked: true,
    });
    await expect(
      fixture.sessions.refresh(next.refreshToken),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rolls back token creation if final device consume write fails", async () => {
    const fixture = accessFixture();
    const device = new AccessDeviceService(fixture.request(), fixture.options);
    const started = await device.start(startInput);
    await device.decide({ userCode: started.userCode, decision: "approve" });
    fixture.payload.update.mockRejectedValueOnce(
      new Error("fixture commit failure"),
    );
    await expect(device.poll(started.deviceCode)).rejects.toThrow(
      "fixture commit failure",
    );
    expect(fixture.rows.get(ACCESS_CREDENTIALS_SLUG)).toBeUndefined();
    expect((await device.poll(started.deviceCode)).status).toBe("issued");
    expect(fixture.rows.get(ACCESS_CREDENTIALS_SLUG)).toHaveLength(1);
  });
});
