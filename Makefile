.PHONY: install dev build typecheck lint lint-fix test test-watch semgrep integration deploy

install:
	npm ci

dev:
	npx wrangler dev

build:
	npx wrangler deploy --dry-run --outdir dist

typecheck:
	npx tsc --noEmit

lint:
	npx eslint . && npx prettier --check .

lint-fix:
	npx eslint . --fix && npx prettier --write .

test:
	npx vitest run

test-watch:
	npx vitest

# Static analysis (Semgrep CE). Run before opening a PR. Pinned rule packs so
# local and CI results match.
semgrep:
	semgrep scan --config p/typescript --config p/javascript --config p/secrets --error

# Boots `wrangler dev` locally and exercises the ingest endpoint end-to-end.
# With real Slack creds in .dev.vars, the local consumer posts to the channel.
integration:
	./scripts/integration.sh

deploy:
	npx wrangler deploy
