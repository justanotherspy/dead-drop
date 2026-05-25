import { describe, expect, it, vi } from "vitest";
import { handleQueueBatch } from "../src/consumer/queue";
import type { Env } from "../src/env";
import type { QueuePayload } from "../src/lib/schema";
import { makeEnv } from "./helpers";

function makeMessage(body: QueuePayload) {
  return {
    body,
    id: body.id,
    timestamp: new Date(),
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function makeBatch(messages: ReturnType<typeof makeMessage>[]) {
  return {
    queue: "dead-drop",
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<QueuePayload>;
}

const samplePayload: QueuePayload = {
  id: "11111111-1111-1111-1111-111111111111",
  ts: "2026-05-25T14:02:00.000Z",
  message: "hello",
  anonymous: true,
};

describe("handleQueueBatch", () => {
  it("posts then acks, and records the id for idempotency", async () => {
    const { env, idemKv } = makeEnv();
    const post = vi.fn(async () => {});
    const msg = makeMessage(samplePayload);
    await handleQueueBatch(makeBatch([msg]), env, post);

    expect(post).toHaveBeenCalledWith(env, samplePayload);
    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.retry).not.toHaveBeenCalled();
    expect(idemKv.store.get(`posted:${samplePayload.id}`)).toBe("1");
  });

  it("retries (does not ack) when the post fails", async () => {
    const { env } = makeEnv();
    const post = vi.fn(async () => {
      throw new Error("slack 503");
    });
    const msg = makeMessage(samplePayload);
    await handleQueueBatch(makeBatch([msg]), env, post);

    expect(msg.retry).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it("honors a Retry-After hint on the thrown error", async () => {
    const { env } = makeEnv();
    const post = vi.fn(async () => {
      throw Object.assign(new Error("rate limited"), { retryAfter: 42 });
    });
    const msg = makeMessage(samplePayload);
    await handleQueueBatch(makeBatch([msg]), env, post);

    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 42 });
  });

  it("skips posting a message whose id was already delivered", async () => {
    const { env, idemKv } = makeEnv();
    idemKv.store.set(`posted:${samplePayload.id}`, "1");
    const post = vi.fn(async () => {});
    const msg = makeMessage(samplePayload);
    await handleQueueBatch(makeBatch([msg]), env, post);

    expect(post).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledTimes(1);
  });

  it("processes each message in a batch independently", async () => {
    const { env } = makeEnv();
    const ok: QueuePayload = { ...samplePayload, id: "aaaa" };
    const bad: QueuePayload = { ...samplePayload, id: "bbbb" };
    const post = vi.fn(async (_env: Env, payload: QueuePayload) => {
      if (payload.id === "bbbb") throw new Error("boom");
    });
    const okMsg = makeMessage(ok);
    const badMsg = makeMessage(bad);
    await handleQueueBatch(makeBatch([okMsg, badMsg]), env, post);

    expect(okMsg.ack).toHaveBeenCalledTimes(1);
    expect(badMsg.retry).toHaveBeenCalledTimes(1);
  });
});
