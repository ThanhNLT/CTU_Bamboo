# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0

PY          ?= python3
VENV        ?= .venv
SPHINXBUILD ?= $(VENV)/bin/sphinx-build
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

$(VENV)/.installed: requirements.txt
	$(PY) -m venv $(VENV)
	$(VENV)/bin/pip install -q --upgrade pip
	$(VENV)/bin/pip install -q -r requirements.txt
	touch $@

venv: $(VENV)/.installed

html: venv
	$(SPHINXBUILD) -b html . $(BUILDDIR)/html $(SPHINXOPTS)

check: venv
	$(SPHINXBUILD) -b html -W --keep-going . $(BUILDDIR)/html $(SPHINXOPTS)

live: venv
	$(VENV)/bin/sphinx-autobuild . $(BUILDDIR)/html --host 0.0.0.0 --port $(PORT) --ignore "$(VENV)/*" $(SPHINXOPTS)

linkcheck: venv
	$(SPHINXBUILD) -b linkcheck . $(BUILDDIR)/linkcheck $(SPHINXOPTS)

clean:
	rm -rf $(BUILDDIR)
