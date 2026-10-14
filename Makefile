# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

.PHONY: test-gateway release-compose up down migrate test-db test-actions test-seed test-auth test-all hasura-metadata trino-sql trino-password realm psql bao-token

DEMO_PASSWORD ?= demo-password

up:
	docker compose up -d --build

down:
	docker compose down

migrate:
	docker compose run --rm --build migrate

test-db:
	docker compose run --rm --build --entrypoint /repo/scripts/db/test.sh migrate $(T)

test-actions:
	docker compose --profile test up -d --build hasura-test flowable bootstrap
	docker compose --profile test run --rm --build --name bamboo-actions-test actions-test $(T)

test-seed:
	docker compose run --rm --build -u 0 -v ./:/repo -e TEST_DATABASE_URL=postgresql://bms:$${POSTGRES_PASSWORD:-bms-dev}@db:5432/bms_seed_test \
		seed sh -c "pip install -q pytest -c /repo/constraints.txt && python -m pytest -q"

test-auth:
	docker compose run --rm -u 0 -v ./:/repo -e DEMO_STACK=1 -e DEMO_PASSWORD=$(DEMO_PASSWORD) \
		-e KEYCLOAK_TOKEN_URL=http://keycloak:8080/realms/bms/protocol/openid-connect/token \
		actions sh -c "pip install -q pytest -c /repo/constraints.txt && python -m pytest -q tests/test_demo_login.py"

test-gateway:
	scripts/ci/gateway-smoke.sh

test-all: test-db test-seed test-actions test-auth

hasura-metadata:
	docker compose run --rm -u 0 -v ./:/repo actions python -m app.hasura_metadata
	docker compose run --rm bootstrap

trino-sql:
	docker compose run --rm -u 0 -v ./:/repo actions python -m app.lakehouse_silver
	docker compose up -d --build trino && docker compose run --rm trino-init

trino-password:
	@docker compose exec trino cat /etc/trino/secrets/admin.password

realm:
	docker compose run --rm -u 0 -v ./:/repo seed python -m app.realm

psql:
	docker compose exec db psql -U bms -d bms

release-compose:
	python3 scripts/release/compose_release.py $(or $(VERSION),dev)

bao-token:
	@docker compose run --rm --no-deps -v bamboo_openbao-keys:/openbao/keys:ro --entrypoint python openbao-init \
		-c "import json; print(json.load(open('/openbao/keys/init.json'))['root_token'])"
