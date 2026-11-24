/**
 * @file .ai/tools/codex-request-diagnostics/test/connectVerifiedUpstream.test.ts
 * @version 1.0.0
 * @date 2026-11-20
 * @description Проверяет deadline, отмену и закрытую диагностику upstream TLS без сети.
 */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { TLSSocket } from "node:tls";
import {
  classifyUpstreamTlsError,
  connectVerifiedUpstream,
} from "../src/connectVerifiedUpstream.service.ts";
import type {
  RelayUpstreamAttempt,
  RelayUpstreamFailure,
} from "../src/diagnosticRelay.types.ts";

const CANARY = "TLS_PRIVATE_TEST_CANARY";

/** Синхронный close дополнительно проверяет повторный вход при destroy. */
class FakeSocket extends EventEmitter {
  authorized = true;
  destroyed = false;
  applicationWrites = 0;
  destroy() {
    if (!this.destroyed) {
      this.destroyed = true;
      this.emit("close");
    }
    return this;
  }
  write() {
    this.applicationWrites++;
    return true;
  }
}

/** Timer queue и monotonic clock независимы: моделируют задержку event loop без ожидания. */
function fixture(t: TestContext, deadlineMs = 500) {
  let now = 0;
  let handoffs = 0;
  const sockets: FakeSocket[] = [];
  const attempts: RelayUpstreamAttempt[] = [];
  const failures: RelayUpstreamFailure[] = [];
  const controller = new AbortController();
  t.mock.method(performance, "now", () => now);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  connectVerifiedUpstream({
    connection: 1,
    signal: controller.signal,
    deadlineMs,
    dial() {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as TLSSocket;
    },
    verified() {
      handoffs++;
    },
    failed(details) {
      failures.push(details);
    },
    attempt(event) {
      attempts.push(event);
    },
  });
  return {
    sockets,
    attempts,
    failures,
    controller,
    handoffs: () => handoffs,
    setNow(value: number) {
      now = value;
    },
    tick(ms: number) {
      now += ms;
      t.mock.timers.tick(ms);
    },
  };
}

const resetError = () =>
  Object.assign(new Error(CANARY), { code: "ECONNRESET" });

test("secureConnect после absolute deadline не передаёт socket вызывающему коду", (t) => {
  const f = fixture(t, 100);
  f.sockets[0].emit("connect");
  f.setNow(101);
  f.sockets[0].emit("secureConnect");
  f.tick(1000);
  assert.equal(f.handoffs(), 0);
  assert.equal(f.sockets.length, 1);
  assert.equal(f.failures.length, 1);
  assert.equal(f.failures[0].errorClass === "timeout", true);
  assert.equal(f.sockets[0].destroyed, true);
});

test("overdue retry callback не начинает dial после общего deadline", (t) => {
  const f = fixture(t, 200);
  f.sockets[0].emit("error", resetError());
  assert.equal(
    f.attempts.some((e) => e.outcome === "retrying"),
    true,
  );
  f.setNow(250);
  f.tick(100);
  f.tick(1000);
  assert.equal(f.sockets.length, 1);
  assert.equal(f.handoffs(), 0);
  assert.equal(f.failures.length, 1);
  assert.equal(f.failures[0].errorClass === "timeout", true);
});

test("cancel выигрывает у уже поставленного в очередь secureConnect", (t) => {
  const f = fixture(t);
  setTimeout(() => f.sockets[0].emit("secureConnect"), 0);
  f.controller.abort();
  f.tick(1000);
  assert.equal(f.handoffs(), 0);
  assert.equal(f.sockets.length, 1);
  assert.equal(f.failures.length, 0);
  assert.equal(f.attempts.filter((e) => e.outcome === "cancelled").length, 1);
  assert.equal(f.sockets[0].destroyed, true);
});

test("после handoff ошибки и abort не запускают retry или application writes", (t) => {
  const f = fixture(t);
  f.sockets[0].emit("connect");
  f.sockets[0].emit("secureConnect");
  f.sockets[0].emit("error", resetError());
  f.controller.abort();
  f.tick(15000);
  assert.equal(f.handoffs(), 1);
  assert.equal(f.sockets.length, 1);
  assert.equal(f.failures.length, 0);
  assert.equal(f.sockets[0].applicationWrites, 0);
  assert.equal(
    f.attempts.every((e) => e.applicationForwarded === false),
    true,
  );
  assert.equal(f.attempts.filter((e) => e.outcome === "connected").length, 1);
});

test("known transient допускает только один повтор и verified handoff", (t) => {
  const f = fixture(t);
  f.sockets[0].emit("error", resetError());
  f.tick(100);
  assert.equal(f.sockets.length, 2);
  f.sockets[1].emit("connect");
  f.sockets[1].emit("secureConnect");
  f.sockets[0].emit("error", resetError());
  f.tick(1000);
  assert.equal(f.sockets.length, 2);
  assert.equal(f.handoffs(), 1);
  assert.equal(f.failures.length, 0);
  assert.equal(
    f.sockets.every((s) => s.applicationWrites === 0),
    true,
  );
});

test("повторный transient завершается failure без третьего dial", (t) => {
  const f = fixture(t);
  f.sockets[0].emit("error", resetError());
  f.tick(100);
  f.sockets[1].emit("error", resetError());
  f.tick(15000);
  assert.equal(f.sockets.length, 2);
  assert.equal(f.handoffs(), 0);
  assert.equal(f.failures.length, 1);
  assert.equal(f.failures[0].attempt, 2);
});

test("certificate, unknown и AggregateError не повторяются и не раскрывают canary", (t) => {
  const f = fixture(t);
  const aggregate = Object.assign(
    new AggregateError([new Error(CANARY)], CANARY),
    {
      code: "ECONNRESET",
    },
  );
  assert.equal(classifyUpstreamTlsError(aggregate) === "other", true);
  f.sockets[0].emit("error", aggregate);
  f.tick(1000);
  assert.equal(f.sockets.length, 1);
  assert.equal(f.failures.length, 1);
  assert.equal(f.failures[0].errorClass === "other", true);
  const opaque = Object.create(null);
  Object.defineProperty(opaque, "code", {
    get() {
      throw new Error(CANARY);
    },
  });
  assert.equal(classifyUpstreamTlsError(opaque) === "other", true);
  assert.equal(classifyUpstreamTlsError({ code: CANARY }) === "other", true);
  assert.equal(
    classifyUpstreamTlsError({ code: "ERR_TLS_CERT_ALTNAME_INVALID" }) ===
      "certificate",
    true,
  );
  const allowed = [
    "connection",
    "attempt",
    "stage",
    "outcome",
    "errorClass",
    "applicationForwarded",
  ];
  assert.equal(
    f.attempts.every((e) => Object.keys(e).every((k) => allowed.includes(k))),
    true,
  );
  const failureKeys = [
    "attempt",
    "stage",
    "errorClass",
    "applicationForwarded",
  ];
  assert.equal(
    f.failures.every((e) =>
      Object.keys(e).every((k) => failureKeys.includes(k)),
    ),
    true,
  );
  assert.equal(
    f.failures.every((e) => Object.getPrototypeOf(e) === Object.prototype),
    true,
  );
  assert.equal(
    JSON.stringify({ attempts: f.attempts, failures: f.failures }).includes(
      CANARY,
    ),
    false,
  );
});

test("opaque error getter failclosed без coercion, retry и сохранения текста", (t) => {
  const f = fixture(t);
  const opaque = Object.create(null);
  Object.defineProperty(opaque, "code", {
    get() {
      throw new Error(CANARY);
    },
  });
  f.sockets[0].emit("error", opaque);
  f.tick(1000);
  assert.equal(f.sockets.length, 1);
  assert.equal(f.handoffs(), 0);
  assert.equal(f.failures.length, 1);
  assert.equal(f.failures[0].errorClass === "other", true);
  assert.equal(
    JSON.stringify({ attempts: f.attempts, failures: f.failures }).includes(
      CANARY,
    ),
    false,
  );
});

test("unauthorized secureConnect останавливается без handoff и retry", (t) => {
  const f = fixture(t);
  f.sockets[0].authorized = false;
  f.sockets[0].emit("secureConnect");
  f.tick(1000);
  assert.equal(f.sockets.length, 1);
  assert.equal(f.handoffs(), 0);
  assert.equal(f.failures.length, 1);
  assert.equal(f.failures[0].errorClass === "certificate", true);
});
