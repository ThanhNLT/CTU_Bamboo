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
