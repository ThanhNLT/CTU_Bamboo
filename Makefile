.PHONY: up down migrate test-db test-actions test-all hasura-metadata psql

up:
	docker compose up -d --build

down:
	docker compose down

migrate:
	docker compose run --rm migrate

# Tạo database bms_test sạch, chạy migration và mọi file db/tests/bms_*.sql (tự rollback).
# Chạy một nhóm: make test-db T=bms_031
test-db:
	docker compose run --rm --entrypoint /repo/scripts/db/test.sh migrate $(T)

# Kiểm thử tích hợp dịch vụ actions với Hasura (hasura-test) và Flowable thật.
# Chạy một nhóm: make test-actions T=tests/test_flow_sync.py
test-actions:
	docker compose --profile test up -d --build hasura-test flowable
	docker compose --profile test run --rm --build --name bamboo-actions-test actions-test $(T)

test-all: test-db test-actions

# Sinh lại platform/hasura/metadata.json từ CSDL `bms` (ADR #24), rồi nạp vào Hasura.
hasura-metadata:
	docker compose run --rm -v ./:/repo actions python -m app.hasura_metadata
	docker compose run --rm bootstrap

psql:
	docker compose exec db psql -U bms -d bms
