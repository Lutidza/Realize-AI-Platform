/**
 * @file packages/codex-adapter/src/AsyncQueue.ts
 * @version 2026-08-17
 * @description Provides the ordered async queue used for App Server notifications.
 */

type Pending<T> = {
  reject: (reason: Error) => void;
  resolve: (value: IteratorResult<T>) => void;
};

/** Single-consumer async queue with deterministic close and failure semantics. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private ended = false;
  private failure?: Error;
  private readonly pending: Pending<T>[] = [];
  private readonly values: T[] = [];

  end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const waiter of this.pending.splice(0))
      waiter.resolve({ done: true, value: undefined });
  }

  fail(error: Error): void {
    if (this.ended) return;
    this.failure = error;
    this.ended = true;
    for (const waiter of this.pending.splice(0)) waiter.reject(error);
  }

  push(value: T): void {
    if (this.ended) return;
    const waiter = this.pending.shift();
    if (waiter) waiter.resolve({ done: false, value });
    else this.values.push(value);
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        const value = this.values.shift();
        if (value !== undefined) return { done: false, value };
        if (this.failure) throw this.failure;
        if (this.ended) return { done: true, value: undefined };

        return await new Promise<IteratorResult<T>>((resolve, reject) => {
          this.pending.push({ reject, resolve });
        });
      },
    };
  }
}
