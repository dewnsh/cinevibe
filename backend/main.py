"""
main.py  –  CineVibe Backend | FastAPI Application Entry Point
==============================================================
Endpoints
---------
GET /api/health                       -> service liveness check
GET /api/recommend?title=&limit=      -> content-based recommendations
GET /api/discover?mood=&type=         -> mood-based TMDB discovery
GET /api/trailer?id=&type=            -> YouTube trailer key lookup

Dev server
----------
    cd backend
    uvicorn main:app --reload --port 8000

Interactive docs
----------------
    http://127.0.0.1:8000/docs          (Swagger UI)
    http://127.0.0.1:8000/redoc         (ReDoc)
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import APP_TITLE, APP_VERSION, APP_DESCRIPTION, CORS_ORIGINS
from services import tmdb as tmdb_svc
from services import recommender as rec_svc

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("cinevibe.main")


# ---------------------------------------------------------------------------
# Lifespan – initialise / teardown shared resources
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup:  load pickle artifacts + create TMDB HTTP client.
    Shutdown: gracefully close the HTTP client.
    """
    logger.info("CineVibe API starting up …")

    # 1. Warm up TMDB async client
    tmdb_svc.init_client()

    # 2. Load recommendation artifacts into memory
    rec_svc.load_artifacts()

    logger.info("Startup complete. Ready to serve requests.")
    yield

    # Teardown
    await tmdb_svc.close_client()
    logger.info("CineVibe API shut down cleanly.")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title=APP_TITLE,
    version=APP_VERSION,
    description=APP_DESCRIPTION,
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS middleware (dynamically allows FRONTEND_URL + localhost)
# ---------------------------------------------------------------------------
allowed_origins = list(CORS_ORIGINS)
frontend_env = os.getenv("FRONTEND_URL", "")
if frontend_env:
    for u in frontend_env.split(","):
        u_clean = u.strip()
        if u_clean and u_clean not in allowed_origins:
            allowed_origins.append(u_clean)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Response models (Pydantic)
# ---------------------------------------------------------------------------
class Provider(BaseModel):
    name: str
    logo: str | None = None


class ProvidersDetail(BaseModel):
    country: str | None = None
    flatrate: list[Provider] = []
    rent:     list[Provider] = []
    buy:      list[Provider] = []


class MovieDetail(BaseModel):
    id:           int | None = None
    title:        str
    overview:     str = ""
    poster_url:   str | None = None
    backdrop_url: str | None = None
    vote_average: float = 0.0
    release_year: int | None = None
    genres:       list[str] = []
    providers:    ProvidersDetail = ProvidersDetail()
    media_type:   str = "movie"


class RecommendResponse(BaseModel):
    query:   str
    found:   bool
    results: list[MovieDetail]


class DiscoverResponse(BaseModel):
    mood:       str
    media_type: str
    results:    list[MovieDetail]


class TrailerResponse(BaseModel):
    id:         int
    media_type: str
    trailer_key: str | None = None
    embed_url:   str | None = None


class HealthResponse(BaseModel):
    status:  str
    version: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get(
    "/api/health",
    response_model=HealthResponse,
    tags=["Utility"],
    summary="Service liveness check",
)
async def health() -> dict[str, str]:
    """Returns `{"status": "ok"}` when the service is up and artifacts are loaded."""
    return {"status": "ok", "version": APP_VERSION}


@app.get(
    "/api/recommend",
    response_model=RecommendResponse,
    tags=["Recommendations"],
    summary="Content-based movie recommendations",
)
async def recommend(
    title: str = Query(
        ...,
        description="Movie title to find recommendations for (case-insensitive).",
        examples={"inception": {"value": "Inception"}},
        min_length=1,
    ),
    limit: int = Query(
        default=8,
        ge=1,
        le=10,
        description="Number of recommendations to return (1–10, default 8).",
    ),
) -> dict[str, Any]:
    """
    **Content-based recommendation endpoint.**

    Performs a case-insensitive lookup in the local TMDB 5000 dataset,
    retrieves the top similar movie IDs from the pre-computed similarity
    artifact, then enriches each result with live TMDB data (poster,
    rating, streaming providers).

    Falls back to TMDB popular movies if the title is not found locally,
    so the response is always useful rather than a bare error.
    """
    try:
        result = await rec_svc.get_recommendations(movie_title=title, limit=limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return result


@app.get(
    "/api/discover",
    response_model=DiscoverResponse,
    tags=["Discovery"],
    summary="Mood-based TMDB discovery",
)
async def discover(
    mood: str = Query(
        default="action",
        description=(
            "Mood / genre filter. One of: action, thriller, horror, scifi, "
            "feelgood, romance, drama, animation, adventure, mystery, crime, fantasy."
        ),
        examples={"scifi": {"value": "scifi"}, "thriller": {"value": "thriller"}},
    ),
    type: str = Query(
        default="movie",
        description="Media type: 'movie' or 'tv'.",
        examples={"movie": {"value": "movie"}, "tv": {"value": "tv"}},
    ),
) -> dict[str, Any]:
    """
    **Mood-driven discovery endpoint.**

    Maps a mood keyword to one or more TMDB genre IDs and returns the most
    popular matching titles from TMDB Discover, filtered to English-language
    content with at least 200 votes.

    Supported moods: `action`, `thriller`, `horror`, `scifi`, `feelgood`,
    `romance`, `drama`, `animation`, `adventure`, `mystery`, `crime`, `fantasy`.
    """
    media_type = type if type in ("movie", "tv") else "movie"
    try:
        results = await tmdb_svc.discover_by_mood(mood=mood, media_type=media_type)
    except Exception as exc:
        logger.error("discover error: %s", exc)
        raise HTTPException(status_code=502, detail="TMDB discovery request failed.")

    return {"mood": mood, "media_type": media_type, "results": results}


@app.get(
    "/api/trailer",
    response_model=TrailerResponse,
    tags=["Trailers"],
    summary="YouTube trailer key for a movie or TV show",
)
async def trailer(
    id: int = Query(
        ...,
        description="TMDB numeric movie or TV show ID.",
        examples={"inception": {"value": 27205}},
    ),
    type: str = Query(
        default="movie",
        description="Media type: 'movie' or 'tv'.",
        examples={"movie": {"value": "movie"}, "tv": {"value": "tv"}},
    ),
) -> dict[str, Any]:
    """
    **Trailer lookup endpoint.**

    Fetches the YouTube video key for embedding a trailer modal in the
    frontend.  Returns `trailer_key: null` (not a 404) when no trailer is
    available, so the UI can gracefully hide the play button.

    The `embed_url` field is the ready-to-use YouTube embed URL:
    `https://www.youtube.com/embed/{key}?autoplay=1`
    """
    media_type = type if type in ("movie", "tv") else "movie"
    try:
        key = await tmdb_svc.get_trailer_key(tmdb_id=id, media_type=media_type)
    except Exception as exc:
        logger.error("trailer lookup error: %s", exc)
        raise HTTPException(status_code=502, detail="TMDB trailer request failed.")

    embed_url = f"https://www.youtube.com/embed/{key}?autoplay=1" if key else None
    return {"id": id, "media_type": media_type, "trailer_key": key, "embed_url": embed_url}
