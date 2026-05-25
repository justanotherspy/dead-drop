import type { Env } from "../env";

// Queues redeliver on retry; key dedupe on the payload id so a retried message
// isn't double-posted (design §Consumer).
const TTL_SECONDS = 24 * 3600;

export async function alreadyPosted(env: Env, id: string): Promise<boolean> {
  return (await env.IDEMPOTENCY_KV.get(`posted:${id}`)) !== null;
}

export async function markPosted(env: Env, id: string): Promise<void> {
  await env.IDEMPOTENCY_KV.put(`posted:${id}`, "1", { expirationTtl: TTL_SECONDS });
}
