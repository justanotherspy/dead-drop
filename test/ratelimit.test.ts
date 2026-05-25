import { describe, expect, it } from "vitest";
import { checkRateLimits } from "../src/lib/ratelimit";
import { makeEnv } from "./helpers";

const IP = "1.2.3.4";
const HOUR_SECONDS = 3600;

function hourKey(ip: string) {
  const bucket = Math.floor(Date.now() / 1000 / HOUR_SECONDS);
  return `rl:${ip}:${bucket}`;
}

describe("checkRateLimits", () => {
  it("allows and increments the hourly counter on the happy path", async () => {
    const { env, rlKv, increment } = makeEnv();
    const r = await checkRateLimits(env, IP);
    expect(r.allowed).toBe(true);
    expect(rlKv.store.get(hourKey(IP))).toBe("1");
    expect(increment).toHaveBeenCalledWith(400);
  });

  it("blocks with retryAfter 60 when the per-minute binding is exhausted", async () => {
    const { env } = makeEnv({ minuteSuccess: false });
    const r = await checkRateLimits(env, IP);
    expect(r).toEqual({ allowed: false, retryAfter: 60 });
  });

  it("blocks when the per-IP hourly counter is at the cap", async () => {
    const { env, rlKv } = makeEnv();
    rlKv.store.set(hourKey(IP), "20");
    const r = await checkRateLimits(env, IP);
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(HOUR_SECONDS);
  });

  it("blocks when the global ceiling is reached", async () => {
    const { env } = makeEnv({ globalAllowed: false });
    const r = await checkRateLimits(env, IP);
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBe(1800);
  });

  it("skips the global check when the ceiling is not a positive number", async () => {
    const { env, increment } = makeEnv({ ceiling: "0" });
    const r = await checkRateLimits(env, IP);
    expect(r.allowed).toBe(true);
    expect(increment).not.toHaveBeenCalled();
  });
});
