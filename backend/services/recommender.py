"""
services/recommender.py  –  CineVibe | Content-Based Recommendation Engine
===========================================================================
Loads the Phase-1 training artifacts once at startup and exposes three
high-level functions:

    get_recommendations(movie_title, limit=8)               ->  dict  (TMDB-enriched)
    get_ml_recommendations(movie_title, top_n=5)            ->  dict  (pure ML / pickle-only)
    get_compatibility_recommendations(title1, title2, top_n) -> dict  (dual-user midpoint)

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
- Dual-User Compatibility: since similarity.pkl stores only ranked IDs
  (not raw scores), we reconstruct a proxy score vector for each movie
  using a rank-decay formula (score = 1 / rank), average the two vectors
  to find the "midpoint" in taste-space, and return the top-N movies
  closest to that midpoint – excluding both input movies themselves.
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


def get_ml_recommendations(
    movie_title: str,
    top_n: int = 5,
) -> dict:
    """
    Pure ML recommendation lookup powered by the pickle artifacts.

    Unlike ``get_recommendations`` this function performs **no** live TMDB
    network calls.  Results are assembled entirely from the pre-computed
    similarity dict and the lightweight movies DataFrame stored in
    ``movies.pkl``.

    Parameters
    ----------
    movie_title : title string, case-insensitive (e.g. 'inception')
    top_n       : number of recommendations to return (default 5, max 10)

    Returns
    -------
    {
        "query"   : matched title string (or the raw query when not found),
        "found"   : bool – False when the title has no entry in the dataset,
        "results" : [
            {
                "rank"   : int   (1-based similarity rank),
                "id"     : int   (TMDB movie ID – use for trailer / poster calls),
                "title"  : str,
                "genres" : list[str]  (empty list when unavailable),
            },
            …
        ]
    }
    """
    if _movies_df is None or _similarity is None:
        raise RuntimeError("Artifacts not loaded. Call load_artifacts() first.")

    top_n = max(1, min(top_n, 10))
    movie_id = _find_movie_id(movie_title)

    if movie_id is None or movie_id not in _similarity:
        logger.warning(
            "[ML] '%s' not found in local dataset – returning not-found response.",
            movie_title,
        )
        return {"query": movie_title, "found": False, "results": []}

    # Resolve the canonical title from the DataFrame
    row = _movies_df[_movies_df["id"] == movie_id].iloc[0]
    matched_title: str = row["title"]

    # Pull the top-N recommendation IDs (already ranked by similarity score)
    rec_ids: list[int] = _similarity[movie_id][:top_n]

    results: list[dict] = []
    for rank, rec_id in enumerate(rec_ids, start=1):
        match = _movies_df[_movies_df["id"] == rec_id]
        if match.empty:
            # ID exists in similarity dict but was dropped from movies_df — skip
            logger.debug("[ML] rec_id %d not found in movies_df; skipping.", rec_id)
            continue

        rec_row = match.iloc[0]
        raw_genres: str = rec_row.get("genres", "") or ""
        # genres column is stored as pipe-separated string (e.g. 'Action|Drama')
        genres: list[str] = [g for g in raw_genres.split("|") if g]

        results.append(
            {
                "rank":   rank,
                "id":     int(rec_row["id"]),
                "title":  str(rec_row["title"]),
                "genres": genres,
            }
        )

    logger.info(
        "[ML] '%s' (id=%d) → %d recommendations returned.",
        matched_title, movie_id, len(results),
    )
    return {"query": matched_title, "found": True, "results": results}


def get_compatibility_recommendations(
    title1: str,
    title2: str,
    top_n: int = 5,
) -> dict:
    """
    Dual-User Compatibility: find movies that sit at the taste midpoint
    between two input movies.

    Algorithm
    ---------
    Since ``similarity.pkl`` stores only the ranked top-10 recommendation
    IDs per movie (not raw cosine scores), we reconstruct a *proxy score
    vector* for each movie using a rank-decay formula::

        proxy_score(rank) = 1 / (rank + 1)

    Movies absent from a movie's top-10 list receive a score of 0.

    The two proxy vectors are averaged element-wise to produce a
    "midpoint" score for every candidate movie.  The top ``top_n``
    candidates (excluding the two query movies themselves) are returned,
    ranked by their midpoint score.

    Parameters
    ----------
    title1, title2 : case-insensitive movie title strings
    top_n          : number of compromise recommendations (default 5, max 10)

    Returns
    -------
    {
        "title1":   canonical title of movie 1,
        "title2":   canonical title of movie 2,
        "found1":   bool,
        "found2":   bool,
        "results":  [ { rank, id, title, genres, compatibility_score }, … ]
    }
    """
    if _movies_df is None or _similarity is None:
        raise RuntimeError("Artifacts not loaded. Call load_artifacts() first.")

    top_n = max(1, min(top_n, 10))

    movie_id1 = _find_movie_id(title1)
    movie_id2 = _find_movie_id(title2)

    found1 = movie_id1 is not None and movie_id1 in _similarity
    found2 = movie_id2 is not None and movie_id2 in _similarity

    # Resolve canonical titles for display
    def _canonical(movie_id: int | None, raw: str) -> str:
        if movie_id is None:
            return raw
        rows = _movies_df[_movies_df["id"] == movie_id]
        return str(rows.iloc[0]["title"]) if not rows.empty else raw

    canon1 = _canonical(movie_id1, title1)
    canon2 = _canonical(movie_id2, title2)

    if not found1 and not found2:
        logger.warning(
            "[Compat] Neither '%s' nor '%s' found in dataset.", title1, title2
        )
        return {
            "title1": canon1, "title2": canon2,
            "found1": False,   "found2": False,
            "results": [],
        }

    # Build proxy score dicts: { candidate_movie_id -> score }
    def _proxy_scores(mid: int | None) -> dict[int, float]:
        if mid is None or mid not in _similarity:
            return {}
        return {
            rec_id: 1.0 / (rank + 1)
            for rank, rec_id in enumerate(_similarity[mid])
        }

    scores1 = _proxy_scores(movie_id1)
    scores2 = _proxy_scores(movie_id2)

    # Union of all candidate IDs, excluding the two query movies themselves
    excluded: set[int] = {mid for mid in (movie_id1, movie_id2) if mid is not None}
    all_candidates = (set(scores1.keys()) | set(scores2.keys())) - excluded

    # Average the proxy scores → midpoint
    midpoint: list[tuple[int, float]] = [
        (cid, (scores1.get(cid, 0.0) + scores2.get(cid, 0.0)) / 2.0)
        for cid in all_candidates
    ]
    midpoint.sort(key=lambda x: x[1], reverse=True)
    top_candidates = midpoint[:top_n]

    # Build result objects
    results: list[dict] = []
    for rank, (rec_id, compat_score) in enumerate(top_candidates, start=1):
        match = _movies_df[_movies_df["id"] == rec_id]
        if match.empty:
            continue
        rec_row = match.iloc[0]
        raw_genres: str = rec_row.get("genres", "") or ""
        genres: list[str] = [g for g in raw_genres.split("|") if g]

        results.append(
            {
                "rank":                rank,
                "id":                  int(rec_row["id"]),
                "title":               str(rec_row["title"]),
                "genres":              genres,
                "compatibility_score": round(compat_score * 100, 1),  # 0–100 scale
            }
        )

    logger.info(
        "[Compat] '%s' × '%s' → %d compromise recommendations.",
        canon1, canon2, len(results),
    )
    return {
        "title1": canon1, "title2": canon2,
        "found1": found1,  "found2": found2,
        "results": results,
    }


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
