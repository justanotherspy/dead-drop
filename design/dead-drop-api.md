# Dead Drop — API design

The submission form on justanotherspy.com/dead-drop/ POSTs to an external endpoint built here and hosted on CloudFlare. This document is the contract that endpoint must honor. 
It is deliberately **vendor-neutral**: it describes the request/response shape, rate limiting, sanitization, the queue, and the Slack consumer without committing to a specific provider. 
However we would like to use Cloudflare for this if possible.

## Data flow

```
browser form ──POST JSON──▶ ingest endpoint ──enqueue──▶ durable queue ──drain──▶ consumer ──▶ private Slack channel
                              (validate,                  (decouples                (formats,
                               rate-limit,                 ingest from               posts via
                               sanitize)                   Slack)                    webhook/bot)
```

The ingest endpoint does the minimum synchronous work — validate, rate-limit, sanitize, enqueue — and returns immediately. Everything that can fail slowly (Slack delivery) happens asynchronously in the consumer.

## Endpoint

- `POST /`
- **Unauthenticated.** There are no API keys or tokens in the browser.
- `Content-Type: application/json`.

### CORS

The browser calls this cross-origin. Respond to the `OPTIONS` preflight and to `POST` with:

- `Access-Control-Allow-Origin: https://justanotherspy.com` (lock to the site origin; avoid `*`).
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## Request body

```json
{
  "message": "string, required, 1–2000 chars after trim",
  "anonymous": true,
  "alias": "string, optional, ≤80 chars — present only when anonymous=false",
  "company": "honeypot, optional — see below"
}
```

- `message` — required. Reject empty/whitespace-only and anything over the cap.
- `anonymous` — boolean. Default to `true` if missing or not a boolean.
- `alias` — optional display name. Ignore it entirely when `anonymous` is true.
- `company` — **honeypot**. The form keeps this off-screen; humans leave it empty. A non-empty value almost certainly means a bot.

The endpoint must not trust field types or lengths from the client — re-validate everything.

## Responses

Bodies are intentionally minimal and **never echo the submitted message** (no reflected content anywhere in the pipeline).

| Status | When | Body |
| --- | --- | --- |
| `202 Accepted` | Enqueued, **or** silently dropped (honeypot / soft spam) | `{ "ok": true }` 
| `400 Bad Request` | Missing/invalid `message`, malformed JSON | `{ "ok": false, "error": "invalid_request" }` |
| `413 Payload Too Large` | Body or `message` over the cap | `{ "ok": false, "error": "too_large" }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "ok": false, "error": "rate_limited" }` + `Retry-After` header |

Honeypot hits return `202` so bots get no signal that they were caught (the message is discarded, not enqueued). The client treats `res.ok` as success and only special-cases `429`.

## Rate limiting (heavy)

Unauthenticated + public means abuse is the default threat. Limit at two layers:

- **Edge / WAF** — coarse per-IP throttling and basic bot rules in front of the app
- **Application** — a token-bucket or fixed-window counter keyed on client IP (e.g. the platform-provided connecting-IP header), plus a global ceiling.

Suggested starting limits (tune from real traffic):

- Per IP: **~3 / minute** and **~20 / hour**.
- Global: a hard ceiling (e.g. a few hundred/hour) as a backstop against distributed floods.

On limit: `429` + `Retry-After` (seconds). Count requests **before** enqueueing so a flood can't fill the queue. Honeypot-flagged requests are dropped and don't consume queue space.

## Sanitization & safety

Treat every field as hostile input:

- Trim; reject empty `message`; enforce byte/char caps (`message` ≤ 2000, `alias` ≤ 80).
- Strip control characters (except newline/tab) and normalize Unicode.
- **Never render the message as HTML** anywhere. It is plain text end to end
- When composing the Slack message, escape Slack `mrkdwn`/control sequences (`&`, `<`, `>`, and leading `@`/`#`/`!` so it can't trigger mentions or channel pings).
- **Never reflect** the message back to the client in any response.
- Do not log raw message bodies alongside identifying request metadata (see Observability).

## Queue

The endpoint enqueues a minimal, already-sanitized payload and returns:

```json
{
  "id": "uuid",
  "ts": "ISO-8601",
  "message": "sanitized text",
  "anonymous": true,
  "alias": "present only when not anonymous"
}
```

- A **durable** queue decouples ingest from Slack so a Slack outage or slowdown never blocks (or drops) submissions
- Configure retries with backoff and a **dead-letter queue** for messages that repeatedly fail to deliver.
- Do not store sender IP or other identifying metadata in the queued payload — only what the consumer needs to post.

## Consumer → Slack

A worker drains the queue and posts each message to the **private channel of choice**:

- Delivery via a **Slack Incoming Webhook** or a **bot token** (`chat.postMessage`). The secret lives in the platform's secret store — **never** in the client or the repo.
- Format with Block Kit (or simple webhook text): the message body, a timestamp, and either "anonymous" or the escaped alias.
- Retry with exponential backoff on Slack `5xx` / `429` (respect Slack's `Retry-After`).
- Idempotency: key on the payload `id` so a retried queue message isn't double-posted.

Example Slack text (anonymous):

```
:envelope_with_arrow: *new dead drop* · 2026-05-25T14:02Z · _anonymous_
> <escaped message text>
```

## Configuration & secrets

- **Client:** `PUBLIC_DEADDROP_ENDPOINT` — the public ingest URL, baked in at build time. Falls back to a placeholder if unset; set it for production and to a mock echo for local testing.
- **Server:** Slack webhook URL or bot token, rate-limit store binding, and queue binding — all server-side secrets/config, never exposed to the browser.
