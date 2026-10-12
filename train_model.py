"""
train_model.py  –  CineVibe | Phase 1: Offline Recommendation Model Training
=============================================================================
Pipeline:
  1. Load & merge TMDB 5000 movies + credits datasets.
  2. Extract and clean relevant features (genres, keywords, top-3 cast, director).
  3. Remove spaces inside multi-word names so they form single tokens
     (e.g. "Christopher Nolan" → "ChristopherNolan").
  4. Combine features into a single `tags` string per movie.
  5. Stem tokens with NLTK PorterStemmer + lowercase normalisation.
  6. Vectorise with CountVectorizer (max_features=5000, english stop-words).
  7. Compute pairwise cosine similarity.
  8. Persist only the TOP-10 similar movie IDs per movie (compact dict) and a
     lightweight movies DataFrame to ./artifacts/  – total artefact size stays
     well under 5 MB.

Usage:
    python train_model.py
    python train_model.py --query "Inception" --top-n 5
"""

import ast
import os
import pickle
import argparse
import warnings
from typing import List, Dict, Any

import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# ---------------------------------------------------------------------------
# NLTK bootstrap (download 'punkt' only when missing, no internet needed after)
# ---------------------------------------------------------------------------
import nltk

try:
    from nltk.stem.porter import PorterStemmer
except ImportError:
    raise ImportError("nltk is not installed. Run: pip install nltk")

warnings.filterwarnings("ignore")


# ===========================================================================
# 1. DATA LOADING
# ===========================================================================

def load_data(movies_path: str, credits_path: str) -> pd.DataFrame:
    """
    Load and merge the TMDB 5000 movies and credits CSVs.

    Merge key: 'title' (present in both files).  The credits file is renamed
    so that the 'movie_id' column lines up with the movies 'id' column.

    Parameters
    ----------
    movies_path  : path to tmdb_5000_movies.csv
    credits_path : path to tmdb_5000_credits.csv

    Returns
    -------
    Merged DataFrame with all columns from both files.
    """
    movies  = pd.read_csv(movies_path)
    credits = pd.read_csv(credits_path)

    # credits has columns: movie_id, title, cast, crew
    # movies  has columns: budget, genres, homepage, id, keywords, original_language,
    #                      original_title, overview, popularity, production_companies,
    #                      production_countries, release_date, revenue, runtime,
    #                      spoken_languages, status, tagline, title, vote_average,
    #                      vote_count
    merged = movies.merge(credits, on="title")
    print(f"[load_data] Loaded {len(merged):,} movies after merge.")
    return merged


# ===========================================================================
# 2. FEATURE SELECTION & CLEANING
# ===========================================================================

def _safe_parse(value: Any) -> list:
    """Parse a JSON-string column value safely; return empty list on failure."""
    try:
        return ast.literal_eval(value)
    except (ValueError, SyntaxError):
        return []


def _extract_names(json_str: Any, top_n: int = None) -> List[str]:
    """
    Parse a JSON list of dicts and return the 'name' field values.

    Parameters
    ----------
    json_str : raw string from a DataFrame column (e.g. genres, keywords, cast)
    top_n    : if set, only return the first top_n names (used for cast)

    Returns
    -------
    List of name strings, each with internal spaces removed so multi-word
    names become single tokens  (e.g. 'Sam Worthington' → 'SamWorthington').
    """
    items = _safe_parse(json_str)
    names = [item["name"].replace(" ", "") for item in items if "name" in item]
    return names[:top_n] if top_n is not None else names


def _extract_director(crew_str: Any) -> List[str]:
    """
    Parse the crew JSON string and return the director's name as a 1-item list.

    If multiple directors exist (rare), only the first is returned.
    Returns an empty list when no director entry is found.
    """
    crew = _safe_parse(crew_str)
    for member in crew:
        if member.get("job") == "Director":
            return [member["name"].replace(" ", "")]
    return []


def select_and_clean(df: pd.DataFrame) -> pd.DataFrame:
    """
    Reduce the merged DataFrame to the 7 columns we need and clean each one.

    Columns retained  : id, title, overview, genres, keywords, cast, crew
    Post-processing   :
      - genres   → list of genre name tokens
      - keywords → list of keyword tokens
      - cast     → top-3 actor name tokens
      - crew     → director name token (list of 1)
      - overview → list of words (split on whitespace)

    Parameters
    ----------
    df : merged TMDB DataFrame

    Returns
    -------
    Cleaned DataFrame with list-valued feature columns.
    """
    df = df[["id", "title", "overview", "genres", "keywords", "cast", "crew"]].copy()

    # Drop rows where the overview is missing – they add no signal
    df.dropna(subset=["overview"], inplace=True)
    df.reset_index(drop=True, inplace=True)

    df["genres"]   = df["genres"].apply(_extract_names)
    df["keywords"] = df["keywords"].apply(_extract_names)
    df["cast"]     = df["cast"].apply(lambda x: _extract_names(x, top_n=3))
    df["crew"]     = df["crew"].apply(_extract_director)
    df["overview"] = df["overview"].apply(lambda x: x.split())

    print(f"[select_and_clean] {len(df):,} rows after dropping NaN overviews.")
    return df


# ===========================================================================
# 3. TAG CONSTRUCTION & STEMMING
# ===========================================================================

def build_tags(df: pd.DataFrame) -> pd.DataFrame:
    """
    Concatenate all feature lists into a single lowercase string column `tags`.

    Order: overview + genres + keywords + cast + crew
    Spaces inside multi-word names were already removed in select_and_clean,
    so joining with a plain space is safe.

    Parameters
    ----------
    df : cleaned DataFrame with list-valued feature columns

    Returns
    -------
    DataFrame with an added `tags` column (string).
    """
    df["tags"] = (
        df["overview"]
        + df["genres"]
        + df["keywords"]
        + df["cast"]
        + df["crew"]
    ).apply(lambda tokens: " ".join(tokens).lower())

    return df


def stem_tags(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply NLTK PorterStemmer to every token in the `tags` column.

    Stemming reduces vocabulary size (e.g. 'loving', 'loved', 'loves' → 'love')
    which improves recall without requiring a large feature set.

    Parameters
    ----------
    df : DataFrame with a `tags` column

    Returns
    -------
    Same DataFrame with stemmed `tags`.
    """
    ps = PorterStemmer()

    def _stem(text: str) -> str:
        return " ".join(ps.stem(word) for word in text.split())

    df["tags"] = df["tags"].apply(_stem)
    print("[stem_tags] Stemming complete.")
    return df


# ===========================================================================
# 4. VECTORISATION & SIMILARITY
# ===========================================================================

def vectorise(df: pd.DataFrame):
    """
    Fit a CountVectorizer on the `tags` column and return the feature matrix.

    Settings
    --------
    max_features=5000 : keeps only the 5 000 most frequent tokens → keeps RAM low
    stop_words='english' : removes common English filler words (the, a, is …)

    Parameters
    ----------
    df : DataFrame with a `tags` column

    Returns
    -------
    vectors : sparse matrix (n_movies × 5000)
    """
    cv = CountVectorizer(max_features=5000, stop_words="english")
    vectors = cv.fit_transform(df["tags"])
    print(f"[vectorise] Feature matrix shape: {vectors.shape}")
    return vectors


def compute_similarity(vectors) -> np.ndarray:
    """
    Compute the full pairwise cosine-similarity matrix.

    This is a transient, in-memory operation – we never save this matrix to disk.
    Shape: (n_movies × n_movies).  For ~4 800 movies this is ~185 MB in RAM,
    which is fine for a one-time training run.

    Parameters
    ----------
    vectors : sparse feature matrix from vectorise()

    Returns
    -------
    Full cosine similarity matrix (dense numpy float32 array).
    """
    sim = cosine_similarity(vectors)
    print(f"[compute_similarity] Similarity matrix shape: {sim.shape}")
    return sim


# ===========================================================================
# 5. COMPACT ARTIFACT CONSTRUCTION
# ===========================================================================

def build_similarity_dict(
    df: pd.DataFrame,
    sim_matrix: np.ndarray,
    top_n: int = 10,
) -> Dict[int, List[int]]:
    """
    Convert the (n × n) similarity matrix into a compact dict that maps each
    movie `id` to a ranked list of the top_n most similar movie `id`s.

    Format:  { movie_id (int) : [rec_id_1, rec_id_2, …, rec_id_10] }

    The score itself is NOT stored – we store only the ranked IDs so the dict
    stays tiny.  Scores can be reconstructed at query time if needed.

    Parameters
    ----------
    df         : cleaned DataFrame with an `id` column (position-aligned with sim_matrix)
    sim_matrix : full cosine similarity matrix
    top_n      : number of recommendations to keep per movie (default 10)

    Returns
    -------
    similarity_dict : compact {movie_id → [rec_id, …]} mapping
    """
    ids = df["id"].tolist()          # positional index → actual TMDB id
    similarity_dict: Dict[int, List[int]] = {}

    for idx, movie_id in enumerate(ids):
        # argsort descending; skip index 0 (the movie itself, score=1.0)
        ranked_indices = np.argsort(sim_matrix[idx])[::-1][1 : top_n + 1]
        similarity_dict[int(movie_id)] = [int(ids[i]) for i in ranked_indices]

    print(f"[build_similarity_dict] Built compact dict for {len(similarity_dict):,} movies (top {top_n} each).")
    return similarity_dict


def build_movies_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build the lightweight reference DataFrame that the app will use for
    look-ups (id → title, id → genres).

    Columns : id (int), title (str), genres (str, pipe-separated)

    Parameters
    ----------
    df : cleaned DataFrame (genres column is still a list here)

    Returns
    -------
    Lean DataFrame with 3 columns.
    """
    movies_df = df[["id", "title", "genres"]].copy()
    # Flatten genre lists to a readable string: ['Action','Drama'] → 'Action|Drama'
    movies_df["genres"] = movies_df["genres"].apply(
        lambda g: "|".join(g) if isinstance(g, list) else g
    )
    movies_df["id"] = movies_df["id"].astype(int)
    return movies_df


# ===========================================================================
# 6. PERSISTENCE
# ===========================================================================

def save_artifacts(
    similarity_dict: Dict[int, List[int]],
    movies_df: pd.DataFrame,
    output_dir: str = "artifacts",
) -> None:
    """
    Serialise both artefacts to disk as pickle files.

    Files created
    -------------
    <output_dir>/similarity.pkl  – compact {movie_id → [rec_ids]} dict
    <output_dir>/movies.pkl      – lightweight movies DataFrame (id, title, genres)

    Parameters
    ----------
    similarity_dict : output of build_similarity_dict()
    movies_df       : output of build_movies_df()
    output_dir      : directory to write artefacts into (created if missing)
    """
    os.makedirs(output_dir, exist_ok=True)

    sim_path    = os.path.join(output_dir, "similarity.pkl")
    movies_path = os.path.join(output_dir, "movies.pkl")

    with open(sim_path, "wb") as f:
        pickle.dump(similarity_dict, f, protocol=pickle.HIGHEST_PROTOCOL)

    with open(movies_path, "wb") as f:
        pickle.dump(movies_df, f, protocol=pickle.HIGHEST_PROTOCOL)

    sim_size_kb    = os.path.getsize(sim_path) / 1024
    movies_size_kb = os.path.getsize(movies_path) / 1024

    total_kb = sim_size_kb + movies_size_kb
    size_verdict = "[OK] under 5 MB" if total_kb < 5120 else "[!!] exceeds 5 MB"
    print(f"[save_artifacts] similarity.pkl -> {sim_size_kb:.1f} KB")
    print(f"[save_artifacts] movies.pkl     -> {movies_size_kb:.1f} KB")
    print(f"[save_artifacts] Total          -> {total_kb:.1f} KB  ({size_verdict})")


# ===========================================================================
# 7. RECOMMENDATION QUERY (used for CLI test)
# ===========================================================================

def recommend(
    title: str,
    similarity_dict: Dict[int, List[int]],
    movies_df: pd.DataFrame,
    top_n: int = 5,
) -> pd.DataFrame:
    """
    Return the top_n recommended movies for a given title string.

    Look-up is case-insensitive.  If the title is not found, raises ValueError.

    Parameters
    ----------
    title           : movie title to query (e.g. 'Inception')
    similarity_dict : compact {movie_id → [rec_ids]} dict
    movies_df       : lightweight reference DataFrame
    top_n           : number of results to return (≤ 10)

    Returns
    -------
    DataFrame with columns [rank, id, title, genres] sorted by similarity rank.
    """
    # Case-insensitive match
    mask = movies_df["title"].str.lower() == title.lower()
    matches = movies_df[mask]

    if matches.empty:
        # Try a partial match as fallback
        mask_partial = movies_df["title"].str.lower().str.contains(title.lower(), na=False)
        matches = movies_df[mask_partial]
        if matches.empty:
            raise ValueError(f"Movie '{title}' not found in the dataset.")
        print(f"[recommend] Exact match not found; using closest match: '{matches.iloc[0]['title']}'")

    movie_id = int(matches.iloc[0]["id"])

    if movie_id not in similarity_dict:
        raise KeyError(f"movie_id {movie_id} has no precomputed recommendations.")

    rec_ids = similarity_dict[movie_id][:top_n]

    # Build result table
    result = movies_df[movies_df["id"].isin(rec_ids)].copy()
    # Preserve the ranked order
    id_order = {mid: rank for rank, mid in enumerate(rec_ids)}
    result["rank"] = result["id"].map(id_order)
    result = result.sort_values("rank").reset_index(drop=True)
    result["rank"] = result.index + 1

    return result[["rank", "id", "title", "genres"]]


# ===========================================================================
# 8. MAIN PIPELINE
# ===========================================================================

def run_pipeline(
    movies_csv: str  = "data/tmdb_5000_movies.csv",
    credits_csv: str = "data/tmdb_5000_credits.csv",
    output_dir: str  = "artifacts",
    top_similar: int = 10,
) -> tuple:
    """
    Execute the full training pipeline end-to-end.

    Returns
    -------
    (similarity_dict, movies_df) – the two in-memory artefacts.
    """
    print("=" * 60)
    print("  CineVibe | Phase 1 – Offline Model Training")
    print("=" * 60)

    # ── Step 1: Load ──────────────────────────────────────────────
    df = load_data(movies_csv, credits_csv)

    # ── Step 2: Clean ─────────────────────────────────────────────
    df = select_and_clean(df)

    # ── Step 3: Build tags ────────────────────────────────────────
    df = build_tags(df)

    # ── Step 4: Stem ──────────────────────────────────────────────
    df = stem_tags(df)

    # ── Step 5: Vectorise ─────────────────────────────────────────
    vectors = vectorise(df)

    # ── Step 6: Cosine similarity (in RAM, never saved) ───────────
    sim_matrix = compute_similarity(vectors)

    # ── Step 7: Compact artefacts ─────────────────────────────────
    similarity_dict = build_similarity_dict(df, sim_matrix, top_n=top_similar)
    movies_df       = build_movies_df(df)

    # ── Step 8: Save ──────────────────────────────────────────────
    save_artifacts(similarity_dict, movies_df, output_dir=output_dir)

    print("\n[DONE] Training complete.\n")
    return similarity_dict, movies_df


# ===========================================================================
# CLI ENTRY POINT
# ===========================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CineVibe – train the content-based recommendation model."
    )
    parser.add_argument(
        "--movies-csv",
        default="data/tmdb_5000_movies.csv",
        help="Path to tmdb_5000_movies.csv",
    )
    parser.add_argument(
        "--credits-csv",
        default="data/tmdb_5000_credits.csv",
        help="Path to tmdb_5000_credits.csv",
    )
    parser.add_argument(
        "--output-dir",
        default="artifacts",
        help="Directory to write similarity.pkl and movies.pkl",
    )
    parser.add_argument(
        "--query",
        default="Inception",
        help="Movie title to test recommendations against (default: 'Inception')",
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=5,
        help="Number of recommendations to display in the CLI test (default: 5)",
    )

    args = parser.parse_args()

    # ── Run full pipeline ─────────────────────────────────────────
    similarity_dict, movies_df = run_pipeline(
        movies_csv  = args.movies_csv,
        credits_csv = args.credits_csv,
        output_dir  = args.output_dir,
    )

    # ── CLI verification test ─────────────────────────────────────
    print("=" * 60)
    print(f"  Recommendation test  ->  '{args.query}'")
    print("=" * 60)
    try:
        results = recommend(args.query, similarity_dict, movies_df, top_n=args.top_n)
        print(results.to_string(index=False))
    except (ValueError, KeyError) as e:
        print(f"[ERROR] {e}")

    print("\nDone.")
