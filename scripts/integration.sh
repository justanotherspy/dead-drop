#!/usr/bin/env bash
# Local integration smoke test: boot `wrangler dev` and drive the ingest endpoint.
# A valid submission flows ingest -> local queue -> consumer -> Slack, so with real
# creds in .dev.vars a message should land in the configured channel.
set -euo pipefail

PORT="${PORT:-8787}"
BASE="http://127.0.0.1:${PORT}"
ORIGIN="https://justanotherspy.com"
LOG="$(mktemp)"
# Isolated, throwaway local state so rate-limit/queue/DO counters start fresh each
# run (and don't clobber `make dev` state).
PERSIST="$(mktemp -d)"

if [ ! -f .dev.vars ]; then
  echo "WARNING: .dev.vars not found — Slack posting will fail." >&2
  echo "         Copy .dev.vars.example to .dev.vars and fill in SLACK_BOT_TOKEN / SLACK_CHANNEL_ID." >&2
fi

echo "Starting wrangler dev on port ${PORT} (logs: ${LOG})..."
npx wrangler dev --port "${PORT}" --persist-to "${PERSIST}" >"${LOG}" 2>&1 &
WRANGLER_PID=$!

cleanup() {
  echo "Stopping wrangler dev (pid ${WRANGLER_PID})..."
  kill "${WRANGLER_PID}" 2>/dev/null || true
  wait "${WRANGLER_PID}" 2>/dev/null || true
  rm -rf "${PERSIST}"
}
trap cleanup EXIT

echo "Waiting for server to become ready..."
# Probe with a real POST: OPTIONS is answered without touching any binding, so it
# would report "ready" before the Durable Object / queue / rate-limit bindings are
# warm and the first real POSTs would 500. Wait for a non-5xx/non-000 POST instead.
ready=0
for _ in $(seq 1 60); do
  # `|| true` so a not-yet-listening server (curl exit 7) doesn't trip `set -e`.
  # curl's -w prints "000" on connection failure.
  code=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "${BASE}" \
    -H "Content-Type: application/json" \
    -H "CF-Connecting-IP: 192.0.2.250" \
    --data '{"message":"warmup"}' 2>/dev/null) || true
  if [ "${code}" != "000" ] && [ "${code:0:1}" != "5" ]; then
    ready=1
    break
  fi
  sleep 1
done
if [ "${ready}" -ne 1 ]; then
  echo "Server did not become ready in time." >&2
  cat "${LOG}" >&2
  exit 1
fi

fail=0
assert_status() {
  local desc="$1" expected="$2" actual="$3"
  if [ "${actual}" = "${expected}" ]; then
    echo "PASS: ${desc} (HTTP ${actual})"
  else
    echo "FAIL: ${desc} — expected ${expected}, got ${actual}" >&2
    fail=1
  fi
}

# Each functional assertion uses a distinct random client IP, because rate limiting
# is checked BEFORE body parsing (by design) — reusing one IP would make later
# requests return 429 instead of the 400/413 we're asserting. (post() runs in a
# command-substitution subshell, so a shared counter wouldn't persist; randomize.)
post() {
  local ip="10.$((RANDOM % 256)).$((RANDOM % 256)).$((RANDOM % 254 + 1))"
  curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "${BASE}" \
    -H "Content-Type: application/json" \
    -H "Origin: ${ORIGIN}" \
    -H "CF-Connecting-IP: ${ip}" \
    --data "$1"
}

echo "== valid anonymous message (should post to Slack) =="
assert_status "valid message" 202 "$(post '{"message":"integration test dead drop"}')"

echo "== honeypot (silently dropped, not enqueued) =="
assert_status "honeypot" 202 "$(post '{"message":"spam","company":"BotCorp"}')"

echo "== empty message =="
assert_status "empty message" 400 "$(post '{"message":"   "}')"

echo "== malformed JSON =="
assert_status "malformed json" 400 "$(post '{nope')"

echo "== oversized message (> 2000 chars) =="
big=$(printf 'a%.0s' $(seq 1 2100))
assert_status "oversized message" 413 "$(post "{\"message\":\"${big}\"}")"

echo "== rate-limit burst (per-IP 3/min) =="
limited=0
for n in 1 2 3 4 5; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "${BASE}" \
    -H "Content-Type: application/json" \
    -H "CF-Connecting-IP: 198.51.100.9" \
    --data "{\"message\":\"burst ${n}\"}") || true
  echo "  burst ${n} -> ${code}"
  if [ "${code}" = "429" ]; then limited=1; fi
done
if [ "${limited}" -eq 1 ]; then
  echo "PASS: rate limiting returned 429 under burst"
else
  echo "WARN: no 429 under burst — local rate-limit simulation may differ from production" >&2
fi

echo "Allowing the queue consumer to flush to Slack..."
sleep 5

if [ "${fail}" -eq 0 ]; then
  echo "Integration checks passed. Check the Slack channel for the test message."
else
  echo "Integration checks FAILED." >&2
  exit 1
fi
