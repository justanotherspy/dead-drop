import { vi } from "vitest";
import type { Env } from "../src/env";

export function memoryKV() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

export interface MockEnvOptions {
  minuteSuccess?: boolean;
  globalAllowed?: boolean;
  ceiling?: string;
}

// Builds a fully-mocked Env so handlers can be driven without real bindings.
export function makeEnv(opts: MockEnvOptions = {}) {
  const send = vi.fn(async (_payload: unknown) => {});
  const rlKv = memoryKV();
  const idemKv = memoryKV();
  const increment = vi.fn(async (_ceiling: number) => ({
    allowed: opts.globalAllowed ?? true,
    retryAfter: 1800,
  }));
  const limit = vi.fn(async () => ({ success: opts.minuteSuccess ?? true }));

  const env = {
    DEAD_DROP_QUEUE: { send },
    PER_IP_MINUTE: { limit },
    RL_KV: rlKv,
    IDEMPOTENCY_KV: idemKv,
    GLOBAL_COUNTER: {
      idFromName: vi.fn(() => "global-id"),
      get: vi.fn(() => ({ increment })),
    },
    ALLOWED_ORIGIN: "https://justanotherspy.com",
    SLACK_CHANNEL_ID: "C0123456789",
    GLOBAL_HOURLY_CEILING: opts.ceiling ?? "400",
    SLACK_BOT_TOKEN: "xoxb-test-token",
  } as unknown as Env;

  return { env, send, rlKv, idemKv, increment, limit };
}
