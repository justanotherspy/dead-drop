import { DurableObject } from "cloudflare:workers";

const HOUR_SECONDS = 3600;

export interface Window {
  bucket: number;
  count: number;
}

export interface IncrementResult {
  allowed: boolean;
  retryAfter: number;
}

// Pure fixed-window evaluation, extracted so it can be unit-tested without the
// Durable Object runtime. Returns the decision and, when allowed, the next window
// state to persist.
export function evaluateIncrement(
  stored: Window | undefined,
  ceiling: number,
  nowSeconds: number,
): { result: IncrementResult; next?: Window } {
  const bucket = Math.floor(nowSeconds / HOUR_SECONDS);
  const retryAfter = HOUR_SECONDS - (nowSeconds % HOUR_SECONDS);
  const count = stored && stored.bucket === bucket ? stored.count : 0;
  if (count >= ceiling) {
    return { result: { allowed: false, retryAfter } };
  }
  return { result: { allowed: true, retryAfter }, next: { bucket, count: count + 1 } };
}

// Strict global hourly ceiling. A single Durable Object instance gives the strong
// consistency the native per-colo rate-limit binding and KV can't — the backstop
// against a distributed flood must not under-count.
export class GlobalCounter extends DurableObject {
  async increment(ceiling: number): Promise<IncrementResult> {
    const now = Math.floor(Date.now() / 1000);
    const stored = await this.ctx.storage.get<Window>("window");
    const { result, next } = evaluateIncrement(stored, ceiling, now);
    if (next) {
      await this.ctx.storage.put<Window>("window", next);
    }
    return result;
  }
}
