import type { Context } from "hono";
import type { Env } from "../env";
import { corsHeaders } from "./cors";
import { MAX_BODY_BYTES, validateSubmission, type QueuePayload } from "../lib/schema";
import { sanitizeText } from "../lib/sanitize";
import { checkRateLimits } from "../lib/ratelimit";

type IngestContext = Context<{ Bindings: Env }>;

// POST / — validate, rate-limit, sanitize, enqueue, return immediately.
// Bodies never echo the submitted message (design §Responses).
export async function handleIngest(c: IngestContext): Promise<Response> {
  const env = c.env;
  const headers = corsHeaders(env);
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";

  // Count BEFORE reading/parsing the body so a flood can't fill the queue (§Rate limiting).
  const rl = await checkRateLimits(env, ip);
  if (!rl.allowed) {
    return c.json({ ok: false, error: "rate_limited" }, 429, {
      ...headers,
      "Retry-After": String(rl.retryAfter),
    });
  }

  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return c.json({ ok: false, error: "too_large" }, 413, headers);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return c.json({ ok: false, error: "invalid_request" }, 400, headers);
  }

  const result = validateSubmission(parsed);
  if (result.kind === "honeypot") {
    // Drop silently; 202 gives the bot no signal it was caught. Never enqueued.
    return c.json({ ok: true }, 202, headers);
  }
  if (result.kind === "error") {
    return c.json({ ok: false, error: result.error }, result.status, headers);
  }

  const { submission } = result;
  const message = sanitizeText(submission.message);
  // Sanitizing can empty an all-control-character message that slipped past validation.
  if (message.length === 0) {
    return c.json({ ok: false, error: "invalid_request" }, 400, headers);
  }

  const payload: QueuePayload = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    message,
    anonymous: submission.anonymous,
  };
  if (!submission.anonymous && submission.alias) {
    payload.alias = sanitizeText(submission.alias);
  }

  await env.DEAD_DROP_QUEUE.send(payload);
  return c.json({ ok: true }, 202, headers);
}
