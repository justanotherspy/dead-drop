import type { QueuePayload } from "./lib/schema";
import type { GlobalCounter } from "./do/global-counter";

// Cloudflare's native rate-limit binding surface (not always in generated types).
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  // Bindings
  DEAD_DROP_QUEUE: Queue<QueuePayload>;
  PER_IP_MINUTE: RateLimit;
  RL_KV: KVNamespace;
  IDEMPOTENCY_KV: KVNamespace;
  GLOBAL_COUNTER: DurableObjectNamespace<GlobalCounter>;

  // Vars
  ALLOWED_ORIGIN: string;
  SLACK_CHANNEL_ID: string;
  GLOBAL_HOURLY_CEILING: string;

  // Secret
  SLACK_BOT_TOKEN: string;
}
