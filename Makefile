.PHONY: up down migrate test-db psql

up:
	docker compose up -d

down:
	docker compose down

migrate:
	docker compose run --rm migrate

# Tạo database bms_test sạch, chạy migration và mọi file db/tests/bms_*.sql (tự rollback).
# Chạy một nhóm: make test-db T=bms_031
test-db:
	docker compose run --rm --entrypoint /repo/scripts/db/test.sh migrate $(T)

psql:
	docker compose exec db psql -U bms -d bms
