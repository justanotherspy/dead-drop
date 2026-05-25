import type { Env } from "../env";

const HOUR_SECONDS = 3600;
const PER_IP_HOURLY_LIMIT = 20;

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number; // seconds; only meaningful when !allowed
}

function secondsUntilNextHour(now: number): number {
  return HOUR_SECONDS - (now % HOUR_SECONDS);
}

// Three layers, checked cheapest-first and counted BEFORE enqueue (design §Rate limiting):
//   1. per-IP ~3/min  — native rate-limit binding (per-colo, fast, no I/O wait)
//   2. per-IP ~20/hr  — KV fixed-window counter (binding only supports 10/60s periods)
//   3. global/hour    — Durable Object (strong consistency for the flood backstop)
export async function checkRateLimits(env: Env, ip: string): Promise<RateLimitResult> {
  const minute = await env.PER_IP_MINUTE.limit({ key: ip });
  if (!minute.success) {
    return { allowed: false, retryAfter: 60 };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSeconds / HOUR_SECONDS);
  const hourKey = `rl:${ip}:${bucket}`;
  const current = Number.parseInt((await env.RL_KV.get(hourKey)) ?? "0", 10);
  if (current >= PER_IP_HOURLY_LIMIT) {
    return { allowed: false, retryAfter: secondsUntilNextHour(nowSeconds) };
  }
  // Not atomic, but a fixed-window approximation is acceptable for the hourly cap.
  await env.RL_KV.put(hourKey, String(current + 1), { expirationTtl: HOUR_SECONDS });

  const ceiling = Number.parseInt(env.GLOBAL_HOURLY_CEILING, 10);
  if (Number.isFinite(ceiling) && ceiling > 0) {
    const stub = env.GLOBAL_COUNTER.get(env.GLOBAL_COUNTER.idFromName("global"));
    const global = await stub.increment(ceiling);
    if (!global.allowed) {
      return { allowed: false, retryAfter: global.retryAfter };
    }
  }

  return { allowed: true, retryAfter: 0 };
}
