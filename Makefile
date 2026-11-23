# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

.PHONY: help build build-py build-web install uninstall dist clean gitops-enable gitops-disable gitops-status check check-py check-web check-docs setup-code up-gpu test-gateway release-compose up down migrate test-db test-actions test-seed test-auth test-all hasura-metadata trino-sql trino-password realm psql bao-token

-include config.mk

VERSION ?= $(shell sed -n 's/^@version //p' docs/Header.txt)
PREFIX ?= /usr/local
DESTDIR ?=
BUILD_DIR ?= build
PYTHON_VERSION ?= 3.13
WITH_LAKEHOUSE ?= 0
UV ?= uv
bindir ?= $(PREFIX)/bin
libdir ?= $(PREFIX)/lib
datadir ?= $(PREFIX)/share
sysconfdir ?= $(PREFIX)/etc
docdir ?= $(datadir)/doc/bamboo
pkglibdir = $(libdir)/bamboo
pkgdatadir = $(datadir)/bamboo
pkgsysconfdir = $(sysconfdir)/bamboo
PY_SERVICES = actions seed
UV_GROUPS_actions = $(if $(filter 1,$(WITH_LAKEHOUSE)),--group lakehouse)

DEMO_PASSWORD ?= demo-password
PNPM ?= pnpm
UV_LINT := uv run --frozen --only-group lint

up:
	native="$$(tools/mac/ai.sh up)" && eval "$$native" && profile="$$(tools/ram_profile.sh)" && eval "$$profile" \
		&& docker compose up -d --build --remove-orphans
	@tools/gitops/schedule.sh auto

up-gpu: up

down:
	docker compose down
	@tools/mac/ai.sh down

migrate:
	docker compose run --rm --build migrate

test-db:
	docker compose run --rm --build --entrypoint /repo/tools/db/test.sh migrate $(T)

test-actions:
	docker compose --profile test up -d --build --force-recreate hasura-test flowable bootstrap
	@docker rm bamboo-actions-test > /dev/null 2>&1 || true
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
	$(UV) run --quiet --no-project --with pyyaml python tools/release/compose_release.py \
		$(if $(filter command% environment%,$(origin VERSION)),$(VERSION),dev)

gitops-enable:
	tools/gitops/schedule.sh enable

gitops-disable:
	tools/gitops/schedule.sh disable

gitops-status:
	@tools/gitops/schedule.sh status

bao-token:
	@docker compose run --rm --no-deps -v bamboo_openbao-keys:/openbao/keys:ro --entrypoint python openbao-init \
		-c "import json; print(json.load(open('/openbao/keys/init.json'))['root_token'])"

setup-code:
	docker compose run --rm actions python -m app.setup_code

check: check-py check-web check-docs

check-py:
	uv lock --check
	uv lock --check --project services/ocr
	$(UV_LINT) reuse lint
	$(UV_LINT) ruff check services packages --select E,F,W,B --ignore E501
	$(UV_LINT) ruff check . --select I
	$(UV_LINT) ruff format --check .
	python3 tools/i18n_server.py check
	docker compose --profile test --profile scan config -q

check-web:
	$(PNPM) install --frozen-lockfile
	$(PNPM) turbo run lint format:check build
	node tools/ci/check_licenses.mjs apps/web

check-docs:
	$(MAKE) -C docs check

help:
	@echo "Bamboo $(VERSION): dịch và cài đặt từ mã nguồn (chi tiết: docs/van-hanh/dich-tu-ma-nguon.md)"
	@echo
	@echo "  make build       dịch dịch vụ Python (actions, seed) và giao diện vào $(BUILD_DIR)/"
	@echo "  make install     cài bản đã dịch vào PREFIX (qua DESTDIR nếu có), chạy bằng lệnh 'bamboo'"
	@echo "  make uninstall   gỡ bản đã cài"
	@echo "  make dist        đóng gói mã nguồn bamboo-$(VERSION).tar.gz kèm SHA256SUMS vào $(BUILD_DIR)/dist/"
	@echo "  make clean       xóa $(BUILD_DIR)/ và apps/web/dist/"
	@echo "  make up          dịch image và chạy toàn bộ hệ thống bằng Docker Compose (Mac Apple Silicon: AI chạy GPU Metal trên máy)"
	@echo "  make gitops-enable   tự đối chiếu hệ thống với cấu hình trong Git theo chu kỳ (gitops-disable, gitops-status)"
	@echo "  make check       kiểm tra tĩnh toàn kho mã"
	@echo
	@echo "Cấu hình trước khi dịch: truyền trên dòng lệnh (make build WITH_LAKEHOUSE=1) hoặc ghi vào config.mk"
	@echo "  PREFIX=$(PREFIX)  DESTDIR=$(DESTDIR)  BUILD_DIR=$(BUILD_DIR)"
	@echo "  bindir=$(bindir)  libdir=$(libdir)  datadir=$(datadir)  sysconfdir=$(sysconfdir)"
	@echo "  PYTHON_VERSION=$(PYTHON_VERSION)  WITH_LAKEHOUSE=$(WITH_LAKEHOUSE)  UV=$(UV)  PNPM=$(PNPM)"
	@echo "  VITE_KEYCLOAK_URL, VITE_HASURA_URL, VITE_KEYCLOAK_REALM, VITE_KEYCLOAK_CLIENT: địa chỉ mặc định dựng vào giao diện"

build: build-py build-web

build-py:
	@set -eu; for svc in $(PY_SERVICES); do \
		out="$(BUILD_DIR)/py/$$svc"; venv="$(BUILD_DIR)/venv/$$svc"; mkdir -p "$$out"; \
		case "$$svc" in actions) groups="$(UV_GROUPS_actions)" ;; *) groups="" ;; esac; \
		echo "== bamboo-$$svc: khóa phụ thuộc theo uv.lock"; \
		$(UV) export --quiet --frozen --package "bamboo-$$svc" --no-dev $$groups --no-emit-workspace --no-header \
			-o "$$out/requirements.txt"; \
		$(UV) export --quiet --frozen --package "bamboo-$$svc" --no-dev $$groups --no-editable --no-hashes --no-header \
			--no-annotate | { grep '^\./' || true; } > "$$out/workspace.txt"; \
		echo "== bamboo-$$svc: môi trường Python $(PYTHON_VERSION) tại $$venv"; \
		rm -rf "$$venv"; \
		$(UV) venv --quiet --relocatable --python $(PYTHON_VERSION) "$$venv"; \
		$(UV) pip install --quiet --python "$$venv" -r "$$out/requirements.txt"; \
		if [ -s "$$out/workspace.txt" ]; then \
			$(UV) pip install --quiet --python "$$venv" --no-deps $$(cat "$$out/workspace.txt"); \
		fi; \
	done

build-web:
	$(PNPM) install --frozen-lockfile --filter @bamboo/web...
	$(PNPM) --filter @bamboo/web build

install:
	@set -eu; \
	for svc in $(PY_SERVICES); do \
		[ -x "$(BUILD_DIR)/venv/$$svc/bin/python" ] || { echo "Chưa dịch bamboo-$$svc: chạy 'make build' trước" >&2; exit 1; }; \
	done; \
	[ -f apps/web/dist/index.html ] || { echo "Chưa dịch giao diện: chạy 'make build' trước" >&2; exit 1; }; \
	lib="$(DESTDIR)$(pkglibdir)"; data="$(DESTDIR)$(pkgdatadir)"; etc="$(DESTDIR)$(pkgsysconfdir)"; \
	bin="$(DESTDIR)$(bindir)"; doc="$(DESTDIR)$(docdir)"; \
	rm -rf "$$lib" "$$data"; \
	mkdir -p "$$bin" "$$lib" "$$data/web" "$$data/tools/install" "$$data/db" "$$data/infra" "$$etc" "$$doc"; \
	copy() { mkdir -p "$$2"; tar -C "$$1" --exclude=__pycache__ --exclude='*.pyc' -cf - "$$3" | tar -C "$$2" -xf -; }; \
	strip=""; [ -z "$(DESTDIR)" ] || strip="-s $(DESTDIR)"; \
	for svc in $(PY_SERVICES); do \
		cp -R "$(BUILD_DIR)/venv/$$svc" "$$lib/$$svc"; \
		copy "services/$$svc" "$$data/services/$$svc" app; \
		"$$lib/$$svc/bin/python" -m compileall -q $$strip "$$data/services/$$svc/app"; \
	done; \
	copy services/seed "$$data/services/seed" data; \
	copy infra "$$data/infra" platform; \
	copy db "$$data/db" migrations; \
	copy db "$$data/db" roles; \
	copy tools "$$data/tools" db; \
	cp tools/install/web.py "$$data/tools/install/web.py"; \
	cp -R apps/web/dist/. "$$data/web/"; \
	sed -e 's|@VERSION@|$(VERSION)|g' -e 's|@libdir@|$(pkglibdir)|g' -e 's|@datadir@|$(pkgdatadir)|g' \
		-e 's|@sysconfdir@|$(pkgsysconfdir)|g' tools/install/bamboo.in > "$$bin/bamboo"; \
	chmod 0755 "$$bin/bamboo" "$$data"/tools/db/*.sh; \
	cp tools/install/bamboo.env.example "$$etc/bamboo.env.example"; \
	cp README.md CHANGELOG.md LICENSE NOTICE "$$doc/"; \
	echo "Đã cài Bamboo $(VERSION) vào $(DESTDIR)$(PREFIX); chạy '$(bindir)/bamboo help'"

uninstall:
	rm -f "$(DESTDIR)$(bindir)/bamboo" "$(DESTDIR)$(pkgsysconfdir)/bamboo.env.example"
	rm -rf "$(DESTDIR)$(pkglibdir)" "$(DESTDIR)$(pkgdatadir)" "$(DESTDIR)$(docdir)"
	-rmdir "$(DESTDIR)$(pkgsysconfdir)" 2> /dev/null

dist:
	@mkdir -p "$(BUILD_DIR)/dist"
	git archive --format=tar.gz --prefix=bamboo-$(VERSION)/ -o "$(BUILD_DIR)/dist/bamboo-$(VERSION).tar.gz" HEAD
	cd "$(BUILD_DIR)/dist" && { sha256sum bamboo-$(VERSION).tar.gz || shasum -a 256 bamboo-$(VERSION).tar.gz; } > SHA256SUMS
	@echo "Đã ghi $(BUILD_DIR)/dist/bamboo-$(VERSION).tar.gz và SHA256SUMS"

clean:
	rm -rf "$(BUILD_DIR)" apps/web/dist
