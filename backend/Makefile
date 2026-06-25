.PHONY: dev test lint format install

install:
	uv sync --extra dev

dev:
	uv run uvicorn app.main:app --reload --port 8000 --app-dir src

test:
	uv run pytest

lint:
	uv run ruff check src tests

format:
	uv run ruff format src tests
