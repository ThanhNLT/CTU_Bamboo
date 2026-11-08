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
