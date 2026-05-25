import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import type { Env } from "../src/env";
import { MAX_BODY_BYTES } from "../src/lib/schema";
import { makeEnv } from "./helpers";

function post(env: Env, body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    "/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "1.2.3.4",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    env,
  );
}

describe("ingest POST /", () => {
  it("accepts a valid message: 202, ok:true, sanitized payload enqueued", async () => {
    const { env, send } = makeEnv();
    const res = await post(env, { message: "  hello world  " });
    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.message).toBe("hello world");
    expect(payload.anonymous).toBe(true);
    expect(payload).not.toHaveProperty("alias");
    expect(typeof payload.id).toBe("string");
    expect(typeof payload.ts).toBe("string");
  });

  it("enqueues a sanitized alias when not anonymous", async () => {
    const { env, send } = makeEnv();
    const res = await post(env, { message: "hi", anonymous: false, alias: "  Agent X  " });
    expect(res.status).toBe(202);
    const payload = send.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.anonymous).toBe(false);
    expect(payload.alias).toBe("Agent X");
  });

  it("answers the OPTIONS preflight with locked CORS headers", async () => {
    const { env } = makeEnv();
    const res = await app.request("/", { method: "OPTIONS" }, env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://justanotherspy.com");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
  });

  it("sets CORS headers on the POST response", async () => {
    const { env } = makeEnv();
    const res = await post(env, { message: "hi" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://justanotherspy.com");
  });

  it("silently drops a honeypot hit: 202 and nothing enqueued", async () => {
    const { env, send } = makeEnv();
    const res = await post(env, { message: "hi", company: "Acme Corp" });
    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an empty message with 400 and does not enqueue", async () => {
    const { env, send } = makeEnv();
    const res = await post(env, { message: "   " });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "invalid_request" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a control-character-only message with 400", async () => {
    const { env, send } = makeEnv();
    const res = await post(env, { message: "" });
    expect(res.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const { env } = makeEnv();
    const res = await post(env, "{not json");
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "invalid_request" });
  });

  it("rejects an over-cap message with 413", async () => {
    const { env } = makeEnv();
    const res = await post(env, { message: "a".repeat(2001) });
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "too_large" });
  });

  it("rejects an over-cap raw body with 413", async () => {
    const { env } = makeEnv();
    const huge = "x".repeat(MAX_BODY_BYTES + 1);
    const res = await post(env, huge);
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "too_large" });
  });

  it("returns 429 with Retry-After when rate limited", async () => {
    const { env, send } = makeEnv({ minuteSuccess: false });
    const res = await post(env, { message: "hi" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    await expect(res.json()).resolves.toEqual({ ok: false, error: "rate_limited" });
    expect(send).not.toHaveBeenCalled();
  });

  it("never reflects the submitted message back to the client", async () => {
    const { env } = makeEnv();
    const secret = "TOP-SECRET-NEEDLE-9f3a";
    const res = await post(env, { message: secret });
    const text = await res.text();
    expect(text).not.toContain(secret);
  });
});
