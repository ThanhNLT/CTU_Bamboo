# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

.PHONY: check check-py check-web check-docs setup-code up-gpu test-gateway release-compose up down migrate test-db test-actions test-seed test-auth test-all hasura-metadata trino-sql trino-password realm psql bao-token

DEMO_PASSWORD ?= demo-password
# pnpm ghim ở package.json (packageManager); cài: npm install -g --allow-scripts=pnpm pnpm@12.16.1
PNPM ?= pnpm
UV_LINT := uv run --frozen --only-group lint

# Mọi mức RAM đều chạy đầy đủ, kể cả AI; mức 8 chỉ hạ heap JVM và cho dịch vụ dùng thưa ngủ sớm (ADR #69).
# GPU NVIDIA do sleeper tự dò khi hệ thống đã lên (ADR #79): có card thì AI chạy trên GPU, không thì CPU/RAM.
up:
	eval "$$(tools/ram_profile.sh)"; docker compose up -d --build --remove-orphans

up-gpu: up  # giữ cho lệnh cũ; GPU nay tự dò

down:
	docker compose down

migrate:
	docker compose run --rm --build migrate

test-db:
	docker compose run --rm --build --entrypoint /repo/tools/db/test.sh migrate $(T)

test-actions:
	docker compose --profile test up -d --build hasura-test flowable bootstrap
	docker compose --profile test run --rm --build --name bamboo-actions-test actions-test $(T)

test-seed:
	docker compose run --rm --build -u 0 -v ./:/repo -e TEST_DATABASE_URL=postgresql://bms:$${POSTGRES_PASSWORD:-bms-dev}@db:5432/bms_seed_test \
		seed sh -c "pip install -q pytest -c /opt/bamboo/dev-pins.txt && python -m pytest -q"

test-auth:
	docker compose run --rm -u 0 -v ./:/repo -e DEMO_STACK=1 -e DEMO_PASSWORD=$(DEMO_PASSWORD) \
		-e KEYCLOAK_TOKEN_URL=http://keycloak:8080/realms/bms/protocol/openid-connect/token \
		actions sh -c "pip install -q pytest -c /opt/bamboo/dev-pins.txt && python -m pytest -q tests/test_demo_login.py"

test-gateway:
	tools/ci/gateway-smoke.sh

test-all: test-db test-seed test-actions test-auth

hasura-metadata:
	docker compose run --rm -u 0 -v ./:/repo actions python -m app.hasura_metadata
	docker compose run --rm bootstrap

trino-sql:
	docker compose run --rm -u 0 -v ./:/repo actions python -m app.lakehouse_silver
	docker compose up -d --build sleeper trino-core && docker compose run --rm trino-init

trino-password:
	@docker compose up -d trino-core > /dev/null && docker compose exec trino-core cat /etc/trino/secrets/admin.password

realm:
	docker compose run --rm -u 0 -v ./:/repo seed python -m app.realm

psql:
	docker compose exec db psql -U bms -d bms

release-compose:
	python3 tools/release/compose_release.py $(or $(VERSION),dev)

bao-token:
	@docker compose run --rm --no-deps -v bamboo_openbao-keys:/openbao/keys:ro --entrypoint python openbao-init \
		-c "import json; print(json.load(open('/openbao/keys/init.json'))['root_token'])"

setup-code:
	docker compose run --rm actions python -m app.setup_code

# Kiểm tra tĩnh toàn repo, giống job `lint` của CI (.github/workflows/ci.yml).
check: check-py check-web check-docs

check-py:
	uv lock --check
	uv lock --check --project services/ocr
	$(UV_LINT) reuse lint
	$(UV_LINT) ruff check services packages --select E,F,W,B --ignore E501
	$(UV_LINT) ruff check . --select I
	$(UV_LINT) ruff format --check .
	docker compose --profile test --profile scan config -q

check-web:
	$(PNPM) install --frozen-lockfile
	$(PNPM) turbo run lint format:check build
	node tools/ci/check_licenses.mjs apps/web

check-docs:
	$(MAKE) -C docs check
