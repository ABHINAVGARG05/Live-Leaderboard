export interface PendingWrite {
  gameId: string;
  userId: string;
  score: number;
}

/**
 * In-memory deduplication queue for pending Postgres writes.
 *
 * If the same player submits multiple scores before a flush, only the highest
 * score is retained — mirroring the GREATEST() upsert behavior in Postgres
 * so the queue never regresses a player's score.
 */
export class WriteBehindQueue {
  private queue = new Map<string, PendingWrite>();

  enqueue(gameId: string, userId: string, score: number): void {
    const key = `${gameId}:${userId}`;
    const existing = this.queue.get(key);
    // Only update if the new score is greater or equal (latest wins on ties)
    if (!existing || score >= existing.score) {
      this.queue.set(key, { gameId, userId, score });
    }
  }

  /**
   * Atomically remove and return all pending writes.
   * The queue is empty after this call — the caller owns the returned array.
   */
  drain(): PendingWrite[] {
    const items = Array.from(this.queue.values());
    this.queue.clear();
    return items;
  }

  get size(): number {
    return this.queue.size;
  }
}

export type FlushFn = (items: PendingWrite[]) => Promise<void>;
export type ErrorFn = (err: unknown, items: PendingWrite[]) => void;
export type CompleteFn = (count: number, durationMs: number) => void;

/**
 * Periodically drains the WriteBehindQueue and writes to Postgres in a single
 * bulk UPSERT per interval — dramatically reducing write pressure under load.
 *
 * Lifecycle:
 *   1. Call `start()` once after construction.
 *   2. Call `stop()` + `flush()` during graceful shutdown to drain remaining writes.
 */
export class WriteBehindFlusher {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly queue: WriteBehindQueue,
    private readonly flushFn: FlushFn,
    private readonly intervalMs: number,
    private readonly onError: ErrorFn,
    private readonly onComplete?: CompleteFn,
  ) {}

  start(): void {
    if (this.timer) return; // already running — idempotent
    this.timer = setInterval(() => void this.flush(), this.intervalMs);
    // Unref so the timer does not prevent the Node process from exiting naturally
    if (this.timer.unref) this.timer.unref();
  }

  /** Immediately drain the queue and write everything to Postgres. */
  async flush(): Promise<void> {
    const items = this.queue.drain();
    if (!items.length) return;

    const start = Date.now();
    try {
      await this.flushFn(items);
      this.onComplete?.(items.length, Date.now() - start);
    } catch (err) {
      this.onError(err, items);
    }
  }

  /** Stop the periodic flush timer without draining. Call flush() first if needed. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }
}
