"""Vercel Python entrypoint for the existing PathRak FastAPI application."""

from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from main import app  # noqa: E402,F401
