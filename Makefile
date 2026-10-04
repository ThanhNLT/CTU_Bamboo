# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

.PHONY: release-compose up down migrate test-db test-actions test-seed test-auth test-all hasura-metadata realm psql bao-token

DEMO_PASSWORD ?= demo-password

up:
	docker compose up -d --build

down:
	docker compose down

migrate:
	docker compose run --rm --build migrate

# Tạo database bms_test sạch, chạy migration và mọi file db/tests/bms_*.sql (tự rollback).
# Chạy một nhóm: make test-db T=bms_031
test-db:
	docker compose run --rm --build --entrypoint /repo/scripts/db/test.sh migrate $(T)

# Kiểm thử tích hợp dịch vụ actions với Hasura (hasura-test) và Flowable thật.
# Chạy một nhóm: make test-actions T=tests/test_flow_sync.py
test-actions:
	docker compose --profile test up -d --build hasura-test flowable bootstrap
	docker compose --profile test run --rm --build --name bamboo-actions-test actions-test $(T)

# Seed vào database bms_seed_test sạch: dữ liệu đúng, chạy lại không trùng, khớp realm.
test-seed:
	docker compose run --rm --build -v ./:/repo -e TEST_DATABASE_URL=postgresql://bms:$${POSTGRES_PASSWORD:-bms-dev}@db:5432/bms_seed_test \
		seed sh -c "pip install -q pytest -c /repo/constraints.txt && python -m pytest -q"

# Đăng nhập thật mọi tài khoản demo qua Keycloak + Hasura trên stack đang chạy (`make up`).
test-auth:
	docker compose run --rm -v ./:/repo -e DEMO_STACK=1 -e DEMO_PASSWORD=$(DEMO_PASSWORD) \
		-e KEYCLOAK_TOKEN_URL=http://keycloak:8080/realms/bms/protocol/openid-connect/token \
		actions sh -c "pip install -q pytest -c /repo/constraints.txt && python -m pytest -q tests/test_demo_login.py"

test-all: test-db test-seed test-actions test-auth

# Sinh lại platform/hasura/metadata.json từ CSDL `bms` (ADR #24), rồi nạp vào Hasura.
hasura-metadata:
	docker compose run --rm -v ./:/repo actions python -m app.hasura_metadata
	docker compose run --rm bootstrap

# Sinh lại realm Keycloak từ danh sách tài khoản demo (services/seed/app/demo.py).
realm:
	docker compose run --rm -v ./:/repo seed python -m app.realm

psql:
	docker compose exec db psql -U bms -d bms

# Sinh compose.release.yml (chạy bằng image dựng sẵn trên GHCR, không cần mã nguồn). CI làm việc này khi phát hành.
release-compose:
	python3 scripts/release/compose_release.py $(or $(VERSION),dev)

# Root token OpenBao (chỉ dev) để vào UI http://localhost:8200.
bao-token:
	@docker compose run --rm --no-deps -v bamboo_openbao-keys:/openbao/keys:ro --entrypoint python openbao-init \
		-c "import json; print(json.load(open('/openbao/keys/init.json'))['root_token'])"
