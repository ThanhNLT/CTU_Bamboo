# Bamboo - DX-OS Open-Core
# @version 0.5.1
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
    "chuyen-repo",
    "ban-giao",
    "Thumbs.db",
    ".DS_Store",
]
templates_path = ["_templates"]

extensions = [
    "myst_parser",
    "sphinxcontrib.mermaid",
    "sphinx_copybutton",
]

myst_enable_extensions = [
    "colon_fence",
    "deflist",
    "tasklist",
]
myst_heading_anchors = 3
myst_fence_as_directive = ["mermaid"]

html_theme = "furo"
html_title = project
html_static_path = ["_static"]
html_css_files = ["custom.css"]
html_last_updated_fmt = "%d/%m/%Y"
html_copy_source = False
html_theme_options = {
    "navigation_with_keys": True,
}

copybutton_exclude = ".linenos, .gp"
linkcheck_ignore = [r"http://localhost.*", r"https://t\.me/.*"]
