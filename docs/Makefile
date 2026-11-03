# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0

# Gói Python lấy từ uv.lock ở gốc (package bamboo-docs của uv workspace), cài vào docs/.venv riêng
# để không đụng môi trường của actions ở gốc (hai package khai xung đột phụ thuộc).
VENV        ?= .venv
export UV_PROJECT_ENVIRONMENT := $(abspath $(VENV))
UVRUN       ?= uv run --frozen --package bamboo-docs --no-default-groups
SPHINXBUILD ?= $(UVRUN) sphinx-build
SPHINXOPTS  ?=
BUILDDIR    ?= _build
PORT        ?= 8000

.PHONY: help venv html check live linkcheck clean

help:
	@echo "make html       build HTML vào $(BUILDDIR)/html"
	@echo "make live       build + tự tải lại tại http://localhost:$(PORT)"
	@echo "make check      build, coi mọi cảnh báo là lỗi (dùng trong CI)"
	@echo "make linkcheck  kiểm tra liên kết ngoài"
	@echo "make clean      xóa $(BUILDDIR)"

venv:
	uv sync --frozen --package bamboo-docs --no-default-groups --quiet

html: venv
	$(SPHINXBUILD) -b html . $(BUILDDIR)/html $(SPHINXOPTS)

check: venv
	$(SPHINXBUILD) -b html -W --keep-going . $(BUILDDIR)/html $(SPHINXOPTS)

live: venv
	$(UVRUN) sphinx-autobuild . $(BUILDDIR)/html --host 0.0.0.0 --port $(PORT) --ignore "$(VENV)/*" $(SPHINXOPTS)

linkcheck: venv
	$(SPHINXBUILD) -b linkcheck . $(BUILDDIR)/linkcheck $(SPHINXOPTS)

clean:
	rm -rf $(BUILDDIR)
