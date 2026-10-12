"""
services/recommender.py  –  CineVibe | Content-Based Recommendation Engine
===========================================================================
Loads the Phase-1 training artifacts once at startup and exposes a single
high-level function:

    get_recommendations(movie_title, limit=8)  ->  list[dict]

Design notes
------------
- Pickle loading is synchronous and done once inside load_artifacts().
  FastAPI's lifespan hook calls this before the first request arrives so
  every subsequent call is just an in-memory dict lookup – O(1).
- TMDB enrichment (poster, rating, providers) is fully async: we fan-out
  all httpx requests concurrently with asyncio.gather() so 8 enrichment
  calls complete in roughly the time of the slowest single call.
- Unknown titles fall back to TMDB "popular movies" rather than returning
  an error, giving the UI something useful to display.
"""

import asyncio
import logging
import pickle
from pathlib import Path
from typing import Any

import pandas as pd

from config import SIMILARITY_PKL, MOVIES_PKL
from services import tmdb as tmdb_svc

logger = logging.getLogger("cinevibe.recommender")

# ---------------------------------------------------------------------------
# Module-level state (populated once by load_artifacts)
# ---------------------------------------------------------------------------
_movies_df: pd.DataFrame | None = None          # id, title, genres
_similarity: dict[int, list[int]] | None = None  # { movie_id: [rec_id, …] }


def load_artifacts() -> None:
    """
    Deserialise both pickle artifacts into module-level variables.

    Called once from the FastAPI lifespan context manager so the data is
    ready before the first HTTP request.

    Raises
    ------
    FileNotFoundError : if either pickle does not exist.
    """
    global _movies_df, _similarity

    for path in (SIMILARITY_PKL, MOVIES_PKL):
        if not Path(path).exists():
            raise FileNotFoundError(
                f"Artifact not found: {path}. "
                "Run train_model.py first to generate the artifacts."
            )

    with open(MOVIES_PKL, "rb") as f:
        _movies_df = pickle.load(f)

    with open(SIMILARITY_PKL, "rb") as f:
        _similarity = pickle.load(f)

    logger.info(
        "Artifacts loaded: %d movies, %d similarity entries.",
        len(_movies_df),
        len(_similarity),
    )


def _find_movie_id(title: str) -> int | None:
    """
    Case-insensitive title lookup.  Returns the TMDB movie_id or None.

    Search order:
      1. Exact match (case-insensitive).
      2. Partial / substring match – returns the first hit.
    """
    if _movies_df is None:
        raise RuntimeError("Artifacts not loaded. Call load_artifacts() first.")

    lower = title.strip().lower()

    # Exact
    exact = _movies_df[_movies_df["title"].str.lower() == lower]
    if not exact.empty:
        return int(exact.iloc[0]["id"])

    # Partial
    partial = _movies_df[_movies_df["title"].str.lower().str.contains(lower, na=False)]
    if not partial.empty:
        matched_title = partial.iloc[0]["title"]
        logger.info("Exact match not found for '%s'; using '%s'.", title, matched_title)
        return int(partial.iloc[0]["id"])

    return None


async def get_recommendations(
    movie_title: str,
    limit: int = 8,
) -> dict[str, Any]:
    """
    Return up to `limit` enriched recommendations for `movie_title`.

    Parameters
    ----------
    movie_title : title string, case-insensitive (e.g. 'inception')
    limit       : max number of recommendations to return (≤ 10)

    Returns
    -------
    {
        "query":        matched_title_string,
        "found":        bool,
        "results":      [ {id, title, overview, poster_url, …}, … ]
    }

    Fallback behaviour
    ------------------
    If the title is not in the local dataset, `found` is False and `results`
    contains the current TMDB popular movies so the UI is never empty.
    """
    limit = min(limit, 10)
    movie_id = _find_movie_id(movie_title)

    if movie_id is None or movie_id not in _similarity:
        logger.warning("'%s' not found in dataset – searching TMDB for closest matches.", movie_title)
        closest = await _fallback_search_or_popular(movie_title, limit)
        return {"query": movie_title, "found": False, "results": closest}

    # Resolve matched title for UI display
    row = _movies_df[_movies_df["id"] == movie_id].iloc[0]
    matched_title: str = row["title"]

    # Top similar IDs (already ranked by similarity score)
    rec_ids: list[int] = _similarity[movie_id][:limit]

    # Fan-out all TMDB detail requests concurrently
    tasks = [tmdb_svc.fetch_movie_details(rid) for rid in rec_ids]
    details: list[dict] = await asyncio.gather(*tasks, return_exceptions=False)

    # Filter out empty shells (failed TMDB calls) but keep partial results
    results = [d for d in details if d.get("title") != "Unknown" or d.get("id")]

    return {"query": matched_title, "found": True, "results": results}


async def _fallback_search_or_popular(title: str, limit: int) -> list[dict[str, Any]]:
    """
    Search TMDB by keyword when title is not in the offline ML index,
    falling back to popular movies if search returns no results.
    """
    import httpx
    from services.tmdb import _poster_url

    client = tmdb_svc._get_client()
    try:
        resp = await client.get("/search/movie", params={"query": title, "page": 1})
        resp.raise_for_status()
        items = resp.json().get("results", [])
        if items:
            items = items[:limit]
            # Fetch full details for top matches to include providers and genres
            tasks = [tmdb_svc.fetch_movie_details(item["id"]) for item in items if "id" in item]
            enriched = await asyncio.gather(*tasks, return_exceptions=True)
            results = [
                d for d in enriched
                if isinstance(d, dict) and (d.get("title") != "Unknown" or d.get("id"))
            ]
            if results:
                return results
    except Exception as exc:
        logger.warning("TMDB keyword search failed for '%s': %s", title, exc)

    return await _fallback_popular(limit)


async def _fallback_popular(limit: int) -> list[dict[str, Any]]:
    """
    Fetch currently popular movies from TMDB as a fallback when a title
    cannot be found in the local dataset.
    """
    import httpx
    from services.tmdb import _poster_url

    client = tmdb_svc._get_client()
    try:
        resp = await client.get("/movie/popular", params={"page": 1})
        resp.raise_for_status()
        items = resp.json().get("results", [])[:limit]
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        logger.error("Fallback popular fetch failed: %s", exc)
        return []

    output = []
    for item in items:
        raw_date: str = item.get("release_date", "")
        output.append(
            {
                "id":           item.get("id"),
                "title":        item.get("title", "Unknown"),
                "overview":     item.get("overview", ""),
                "poster_url":   _poster_url(item.get("poster_path")),
                "backdrop_url": _poster_url(item.get("backdrop_path"), "w1280"),
                "vote_average": round(item.get("vote_average", 0.0), 1),
                "release_year": int(raw_date[:4]) if raw_date else None,
                "genres":       [],
                "providers":    {"country": None, "flatrate": [], "rent": [], "buy": []},
            }
        )
    return output
