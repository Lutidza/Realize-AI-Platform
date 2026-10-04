/**
 * @file tests/int/local-search-observability.int.spec.ts
 * @version 1.2.0
 * @date 2026-09-30
 * @description Проверяет автоматическую доставку CLI, строгую проверку входа и повтор после сбоя БД.
 * @see documentation/architecture/repository-search.md
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  enqueueSearchObservation,
  readSearchObservationSpool,
} from "../../.ai/tools/agent-search/src/searchObservationSpool.adapter.mjs";
import { LocalSearchObservationCollector } from "../../services/ai-control-plane/src/LocalSearchObservationCollector.service";
import { searchObservationFixture } from "./searchObservation.fixture";

describe("automatic local search observations", () => {
  let root: string;
  const collectors: LocalSearchObservationCollector[] = [];
  beforeEach(() => {
    const tasks = path.join(process.cwd(), ".ai-workspace/tasks");
    mkdirSync(tasks, { recursive: true });
    root = mkdtempSync(
      path.join(
        tasks,
        `${new Date().toISOString().slice(0, 10)}-local-search-test-`,
      ),
    );
    mkdirSync(path.join(root, ".ai/tools/agent-search"), { recursive: true });
  });
  afterEach(async () => {
    await Promise.all(
      collectors.splice(0).map((collector) => collector.close()),
    );
    vi.useRealTimers();
    rmSync(root, { recursive: true, force: true });
  });

  it("validates local events, rejects arbitrary contents and preserves CLI provenance", async () => {
    const valid = searchObservationFixture();
    const forbidden = {
      ...valid,
      eventID: randomUUID(),
      query: "must_never_reach_postgres",
    };
    enqueueSearchObservation(root, valid);
    enqueueSearchObservation(root, forbidden);
    enqueueSearchObservation(root, {
      ...valid,
      eventID: randomUUID(),
      source: "mcp",
    });
    const append = vi.fn(async () => 1);
    const warn = vi.fn();
    const collector = new LocalSearchObservationCollector(
      root,
      {
        append,
        control: {
          maintain: vi.fn().mockResolvedValue({ revision: 1, cleaned: false }),
        },
      },
      warn,
    );
    collectors.push(collector);
    await collector.flush();
    expect(append).toHaveBeenCalledExactlyOnceWith([valid], "import");
    expect(readSearchObservationSpool(root).rows).toHaveLength(0);
    expect(collector.snapshot()).toMatchObject({
      queued: 0,
      dropped: 2,
      errorCode: null,
    });
    expect(collector.snapshot().lastDeliveredAt).not.toBeNull();
    expect(warn).toHaveBeenCalledWith({
      code: "SEARCH_TELEMETRY_DROPPED",
      dropped: 2,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "must_never_reach_postgres",
    );
  });

  it("keeps events while PostgreSQL is down and retries with bounded backoff", async () => {
    vi.useFakeTimers();
    const event = searchObservationFixture();
    enqueueSearchObservation(root, event);
    const append = vi
      .fn()
      .mockRejectedValueOnce(new Error("private_db_details"))
      .mockResolvedValue(1);
    const warn = vi.fn();
    const collector = new LocalSearchObservationCollector(
      root,
      {
        append,
        control: {
          maintain: vi.fn().mockResolvedValue({ revision: 1, cleaned: false }),
        },
      },
      warn,
    );
    collectors.push(collector);
    await collector.flush();
    expect(readSearchObservationSpool(root).rows).toHaveLength(1);
    expect(collector.snapshot()).toMatchObject({
      queued: 1,
      errorCode: "delivery_unavailable",
    });
    expect(collector.snapshot().lastFailureAt).not.toBeNull();
    await collector.flush();
    expect(append).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(append).toHaveBeenCalledTimes(2);
    expect(readSearchObservationSpool(root).rows).toHaveLength(0);
    expect(collector.snapshot()).toMatchObject({ queued: 0, errorCode: null });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private_db_details");
  });

  it("shares an in-flight delivery and leaves events arriving during it for the next batch", async () => {
    const first = searchObservationFixture();
    const second = { ...first, eventID: randomUUID() };
    enqueueSearchObservation(root, first);
    let resolve!: (value: number) => void;
    const append = vi
      .fn(async () => 1)
      .mockImplementationOnce(
        () =>
          new Promise<number>((done) => {
            resolve = done;
          }),
      );
    const collector = new LocalSearchObservationCollector(
      root,
      {
        append,
        control: {
          maintain: vi.fn().mockResolvedValue({ revision: 1, cleaned: false }),
        },
      },
      vi.fn(),
    );
    collectors.push(collector);
    const pending = collector.flush();
    expect(collector.flush()).toBe(pending);
    enqueueSearchObservation(root, second);
    resolve(1);
    await pending;
    expect(append).toHaveBeenCalledTimes(1);
    expect(
      readSearchObservationSpool(root).rows.map((row) => row.eventID),
    ).toEqual([second.eventID]);
    await collector.close();
    expect(append).toHaveBeenNthCalledWith(2, [second], "import");
    expect(readSearchObservationSpool(root).rows).toHaveLength(0);
  });
});
