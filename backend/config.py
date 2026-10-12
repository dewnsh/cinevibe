"""
config.py  –  CineVibe Backend | Configuration & Settings
==========================================================
Loads environment variables from:
  1. A .env file located at the project root (../.env relative to this file).
  2. Actual environment variables as a fallback (useful in Docker / CI).

All settings are exposed as module-level constants so imports are clean:
    from config import TMDB_API_KEY, TMDB_BASE_URL
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Locate and load the .env file
# This file lives at:  <project_root>/backend/config.py
# The .env lives at:   <project_root>/.env
# ---------------------------------------------------------------------------
_ROOT_DIR = Path(__file__).resolve().parent.parent  # …/movie rec another/
_ENV_FILE = _ROOT_DIR / ".env"

load_dotenv(dotenv_path=_ENV_FILE, override=False)

# ---------------------------------------------------------------------------
# TMDB settings
# ---------------------------------------------------------------------------
TMDB_API_KEY: str = os.getenv("TMDB_API_KEY", "")
TMDB_BASE_URL: str = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE: str = "https://image.tmdb.org/t/p"

if not TMDB_API_KEY:
    raise EnvironmentError(
        "TMDB_API_KEY is missing. "
        "Add it to the .env file at the project root or set it as an environment variable."
    )

# ---------------------------------------------------------------------------
# Artifact paths (relative to project root)
# ---------------------------------------------------------------------------
ARTIFACTS_DIR: Path = _ROOT_DIR / "artifacts"
SIMILARITY_PKL: Path = ARTIFACTS_DIR / "similarity.pkl"
MOVIES_PKL: Path     = ARTIFACTS_DIR / "movies.pkl"

# ---------------------------------------------------------------------------
# Server / app settings
# ---------------------------------------------------------------------------
APP_TITLE: str       = "CineVibe API"
APP_VERSION: str     = "1.0.0"
APP_DESCRIPTION: str = "Content-based movie recommendations + live TMDB discovery."

_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_fe_env = os.getenv("FRONTEND_URL", "")
if _fe_env:
    for _u in _fe_env.split(","):
        _cleaned = _u.strip()
        if _cleaned and _cleaned not in _origins:
            _origins.append(_cleaned)

CORS_ORIGINS: list[str] = _origins

# Provider preference order for streaming badges
PROVIDER_COUNTRIES: list[str] = ["IN", "US", "GB"]
