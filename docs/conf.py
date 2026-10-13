# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
"""Cấu hình Sphinx cho tài liệu DX-OS Open-Core (Markdown qua MyST)."""

from datetime import date

project = "Bamboo"
author = "OLP OSS"
copyright = f"{date.today().year}, {author}"

language = "vi"
root_doc = "index"
source_suffix = {".md": "markdown"}
exclude_patterns = [
    "_build",
    ".venv",
    "**/node_modules",
    "README.md",
    "agents",
    "Thumbs.db",
    ".DS_Store",
]
templates_path = ["_templates"]

extensions = [
    "myst_parser",
    "sphinxcontrib.mermaid",
    "sphinx_copybutton",
]

# --- MyST -------------------------------------------------------------------
myst_enable_extensions = [
    "colon_fence",  # ::: cho directive
    "deflist",
    "tasklist",  # - [x] trong mục "Còn phải làm"
]
myst_heading_anchors = 3  # liên kết kiểu GitHub tới tiêu đề h1–h3
myst_fence_as_directive = ["mermaid"]  # ```mermaid hiển thị như trên GitHub

# --- HTML -------------------------------------------------------------------
html_theme = "furo"
html_title = project
html_static_path = ["_static"]
html_css_files = ["custom.css"]
html_last_updated_fmt = "%d/%m/%Y"
html_copy_source = False
html_theme_options = {
    "navigation_with_keys": True,
    # Bật khi có kho công khai để hiện nút "Sửa trang này":
    # "source_repository": "https://<forge>/<org>/Bamboo/",
    # "source_branch": "main",
    # "source_directory": "docs/",
}

# --- Tiện ích ---------------------------------------------------------------
copybutton_exclude = ".linenos, .gp"
linkcheck_ignore = [r"http://localhost.*", r"https://t\.me/.*"]
