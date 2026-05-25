# CLAUDE.md

Guidance for working in this repository.

## What this is

Dead Drop is the ingest API behind the submission form on `justanotherspy.com/dead-drop/`.
It runs on **Cloudflare Workers** (TypeScript + Hono). The contract is defined in
[`design/dead-drop-api.md`](design/dead-drop-api.md) — read it before changing behavior.

Pipeline (browser → Slack):

```
POST / (ingest Worker)  →  Cloudflare Queue  →  queue consumer  →  private Slack channel
  validate · rate-limit ·     durable +           idempotent ·
  sanitize · enqueue · 202    dead-letter         format · post (slack-edge)
```

## ⚠️ Keep the docs in sync

When you change behavior, the request/response contract, rate limits, sanitization,
queue/consumer logic, bindings, or secrets, **update the docs in the same change**:

- [`design/dead-drop-api.md`](design/dead-drop-api.md) — the API contract (source of truth).
- This `CLAUDE.md` — commands, setup, and operational notes.
- [`.env.example`](.env.example) / [`.dev.vars.example`](.dev.vars.example) — if any
  variable or secret is added, removed, or renamed.

A change that alters behavior but not the docs is incomplete.

## Layout

```
src/
  index.ts            default export { fetch, queue }; exports GlobalCounter DO
  app.ts              Hono app (routes)
  ingest/handler.ts   POST / orchestration
  ingest/cors.ts      locked CORS headers + preflight
  consumer/queue.ts   queue() consumer: idempotency, post, retry/DLQ
  lib/schema.ts       request validation + payload types
  lib/sanitize.ts     trim/strip-control/NFC + Slack mrkdwn escape
  lib/ratelimit.ts    per-IP minute (binding) + per-IP hour (KV) + global (DO)
  lib/slack.ts        Block Kit formatting + chat.postMessage via slack-edge
  lib/idempotency.ts  KV dedupe on payload id
  do/global-counter.ts strict global hourly ceiling (Durable Object)
test/                 vitest (@cloudflare/vitest-pool-workers)
scripts/integration.sh local end-to-end smoke test
```

## Commands

| Command            | What it does                                          |
| ------------------ | ----------------------------------------------------- |
| `make dev`         | `wrangler dev` (local Workers + Queues via Miniflare) |
| `make test`        | unit tests (Vitest, Workers pool)                     |
| `make typecheck`   | `tsc --noEmit`                                        |
| `make lint`        | ESLint + Prettier check                               |
| `make lint-fix`    | autofix lint + format                                 |
| `make semgrep`     | Semgrep CE scan (run before opening a PR)             |
| `make integration` | boot `wrangler dev` and drive the endpoint end-to-end |
| `make build`       | `wrangler deploy --dry-run` (the PR build gate)       |
| `make deploy`      | `wrangler deploy` (normally via the gated workflow)   |

### Before opening a PR

Run `make semgrep` locally (the user expects this) and make sure
`make typecheck lint test build` are green.

### CI failures

Use the **shuck** binary to read the exact failing CI step logs for a PR:

```
shuck --json            # open PR for the current branch
shuck <pr-url> --json
```

## Testing notes

- Tests run inside the Workers runtime via `@cloudflare/vitest-pool-workers`
  (config: `cloudflareTest` plugin in `vitest.config.ts`, v4 API).
- Handler/consumer tests drive code with a mocked `Env` (`test/helpers.ts`) so no
  real bindings or Slack calls are needed. The consumer takes an injectable `post`.
- The Durable Object's window logic is unit-tested via the pure `evaluateIncrement`
  (the DO base class can't be constructed with a fake state in the runtime).

## One-time setup (production)

These are done out of band; the deploy workflow does **not** create them:

1. Create resources and put their ids in `wrangler.jsonc`:
   - `wrangler queues create dead-drop` and `wrangler queues create dead-drop-dlq`
   - `wrangler kv namespace create RL_KV` and `... IDEMPOTENCY_KV` → replace the
     `REPLACE_WITH_*_ID` placeholders.
   - Set `SLACK_CHANNEL_ID` in `wrangler.jsonc` vars.
2. Push the Slack secret: `wrangler secret put SLACK_BOT_TOKEN`.
3. GitHub repo: add Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. GitHub repo: configure required reviewers on the `production` Environment
   (Settings → Environments) so the deploy job is gated.

## Secrets

Never commit secrets. `SLACK_BOT_TOKEN` lives in Wrangler secrets (prod) and
`.dev.vars` (local, gitignored). `CLOUDFLARE_*` live in GitHub Actions secrets.
`.env.example` and `.dev.vars.example` document the names only.
