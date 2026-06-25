r"""Repo guard: forbid em and en dashes in our source and docs.

These typographic dashes read as AI-generated; we keep prose to the plain
hyphen-minus (-). The design mockup is excluded because it is an imported
artifact, not code we author. Regular hyphen-minus is always allowed.

The forbidden characters are referenced via \u escapes (not literals) so this
guard file does not trip itself.
"""

from __future__ import annotations

import os
import pathlib

import pytest

# tests/ -> backend/ -> repo root
REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]

# Codepoints, not literals, so this guard file never trips itself.
FORBIDDEN = {
    0x2014: "em dash (U+2014)",
    0x2013: "en dash (U+2013)",
}
FORBIDDEN_CHARS = frozenset(chr(cp) for cp in FORBIDDEN)

# File types we author and want kept clean.
INCLUDE_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".py", ".md", ".toml", ".json", ".txt", ".yml", ".yaml",
}
INCLUDE_NAMES = {".env.example"}

# Never descend into these directories. `design/` holds imported mockup
# artifacts we don't author, so it's exempt as a whole.
EXCLUDE_DIRS = {
    "node_modules", ".git", ".venv", "venv", ".expo", "dist", "build",
    "__pycache__", ".pytest_cache", ".ruff_cache", ".mypy_cache", "design",
}

EXCLUDE_FILE_NAMES = {"package-lock.json", "uv.lock", "yarn.lock", "pnpm-lock.yaml"}


def _files_to_check() -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    # os.walk + in-place pruning so we never descend into excluded dirs
    # (avoids stat-ing the ~tens of thousands of node_modules/.venv entries).
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for name in filenames:
            if name in EXCLUDE_FILE_NAMES:
                continue
            path = pathlib.Path(dirpath, name)
            if path.suffix in INCLUDE_SUFFIXES or name in INCLUDE_NAMES:
                files.append(path)
    return files


def test_no_em_or_en_dashes() -> None:
    offenders: list[str] = []
    for path in _files_to_check():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue  # binary-ish; skip
        for lineno, line in enumerate(text.splitlines(), start=1):
            for ch in set(line) & FORBIDDEN_CHARS:
                rel = path.relative_to(REPO_ROOT).as_posix()
                label = FORBIDDEN[ord(ch)]
                offenders.append(f"{rel}:{lineno}  {label}: {line.strip()}")

    if offenders:
        listing = "\n".join(offenders)
        pytest.fail(
            f"Found {len(offenders)} forbidden dash(es). Use a plain hyphen (-) instead:\n"
            f"{listing}"
        )
