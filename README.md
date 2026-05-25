# dead-drop

Anonymous-message ingest API for the submission form on `justanotherspy.com/dead-drop/`.

It runs on **Cloudflare Workers** (TypeScript + Hono): a public `POST /` endpoint
validates, rate-limits, sanitizes, and enqueues each submission, then a queue
consumer posts it to a private Slack channel. Messages are plain text end to end and
are never reflected back to the client.

```
browser form ──POST JSON──▶ ingest Worker ──enqueue──▶ Cloudflare Queue ──▶ consumer ──▶ private Slack channel
```

- **Contract:** [`design/dead-drop-api.md`](design/dead-drop-api.md)
- **Dev/ops guide:** [`CLAUDE.md`](CLAUDE.md)
- **Deployed at:** `https://dead-drop.justanotherspy.com`

## Quick start

```bash
npm ci
cp .dev.vars.example .dev.vars   # fill in SLACK_BOT_TOKEN / SLACK_CHANNEL_ID
make dev                         # run locally (wrangler dev)
make test                        # unit tests
make integration                 # end-to-end smoke test against a local server
```

See [`CLAUDE.md`](CLAUDE.md) for the full command list, one-time production setup, and
the gated deploy workflow.

## Stack

- Cloudflare Workers + [Hono](https://hono.dev) — ingest endpoint
- Cloudflare Queues (+ dead-letter queue) — durable decoupling
- Cloudflare KV + a Durable Object — idempotency and rate-limit state
- [`slack-edge`](https://www.npmjs.com/package/slack-edge) — `chat.postMessage`
- Vitest (`@cloudflare/vitest-pool-workers`), ESLint, Prettier, Semgrep CE
