// src/services/api.js
// ─────────────────────────────────────────────────────────────────────────────
// Structured API helpers targeting the CineVibe FastAPI backend.
// Reads base URL from import.meta.env.VITE_API_BASE_URL (falls back to http://localhost:8000).
// Gracefully falls back to mock data if the backend server is unreachable.
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const BASE = `${API_BASE_URL.replace(/\/+$/, '')}/api`
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500'

// ── Mock data for graceful offline fallback ──────────────────────────────────
export const MOCK_MOVIES = [
  {
    id: 27205,
    title: 'Inception',
    overview:
      'Dom Cobb is a skilled thief who steals secrets from deep within the subconscious. Offered a chance to reclaim his life, he must attempt the impossible: plant an idea in someone\'s mind.',
    poster_url: `${TMDB_IMG}/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg`,
    backdrop_url: 'https://image.tmdb.org/t/p/w1280/s3TBrRGB1iav7gFOCNx3H31MoES.jpg',
    vote_average: 8.8,
    release_year: 2010,
    genres: ['Sci-Fi', 'Thriller', 'Action'],
    match: 96,
    runtime: '2h 28m',
    rating: 'PG-13',
    director: 'Christopher Nolan',
    cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page', 'Tom Hardy'],
    hook: 'Layered realities. Impossible heists.',
    providers: {
      flatrate: [
        { name: 'Netflix', logo: null },
        { name: 'Prime Video', logo: null },
      ],
    },
  },
  {
    id: 157336,
    title: 'Interstellar',
    overview:
      'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival. When Earth becomes uninhabitable, Cooper must leave his family behind.',
    poster_url: `${TMDB_IMG}/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg`,
    backdrop_url: 'https://image.tmdb.org/t/p/w1280/pbrkL804c8yAv3zBZR4QPEafpAR.jpg',
    vote_average: 8.7,
    release_year: 2014,
    genres: ['Sci-Fi', 'Adventure', 'Drama'],
    match: 94,
    runtime: '2h 49m',
    rating: 'PG-13',
    director: 'Christopher Nolan',
    cast: ['Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain'],
    hook: 'Big ideas. Even bigger emotions.',
    providers: {
      flatrate: [
        { name: 'Prime Video', logo: null },
        { name: 'Apple TV', logo: null },
      ],
    },
  },
  {
    id: 603,
    title: 'The Matrix',
    overview:
      'Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.',
    poster_url: `${TMDB_IMG}/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg`,
    backdrop_url: 'https://image.tmdb.org/t/p/w1280/7u3fh9nfmg4Hb3muJ92ApYWYnmD.jpg',
    vote_average: 8.2,
    release_year: 1999,
    genres: ['Sci-Fi', 'Action'],
    match: 91,
    runtime: '2h 16m',
    rating: 'R',
    director: 'Lana & Lilly Wachowski',
    cast: ['Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss', 'Hugo Weaving'],
    hook: 'Question your reality. Choose the red pill.',
    providers: {
      flatrate: [
        { name: 'Netflix', logo: null },
        { name: 'Disney+ Hotstar', logo: null },
      ],
    },
  },
  {
    id: 264660,
    title: 'Ex Machina',
    overview:
      'A young programmer is selected to participate in a ground-breaking experiment in synthetic intelligence by evaluating the human qualities of a highly advanced humanoid A.I.',
    poster_url: `${TMDB_IMG}/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg`,
    backdrop_url: 'https://image.tmdb.org/t/p/w1280/vL5E4mNq0b0jL4R2iUa8O6xNlA2.jpg',
    vote_average: 7.7,
    release_year: 2014,
    genres: ['Sci-Fi', 'Drama'],
    match: 88,
    runtime: '1h 48m',
    rating: 'R',
    director: 'Alex Garland',
    cast: ['Domhnall Gleeson', 'Alicia Vikander', 'Oscar Isaac'],
    hook: 'There is nothing more human than the will to survive.',
    providers: {
      flatrate: [
        { name: 'Apple TV', logo: null },
      ],
    },
  },
]

export const MOCK_DISCOVER = {
  trending: MOCK_MOVIES,
  action: [
    {
      id: 550,
      title: 'Fight Club',
      overview: 'A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.',
      poster_url: `${TMDB_IMG}/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg`,
      backdrop_url: 'https://image.tmdb.org/t/p/w1280/hZkgoQYus5vegHoetLkCJzb17zJ.jpg',
      vote_average: 8.4,
      release_year: 1999,
      genres: ['Action', 'Drama'],
      match: 95,
      hook: 'Mischief. Mayhem. Soap.',
      providers: { flatrate: [{ name: 'Prime Video' }] }
    },
    ...MOCK_MOVIES
  ],
  scifi: MOCK_MOVIES,
  feelgood: [
    {
      id: 13,
      title: 'Forrest Gump',
      overview: 'A man with a low IQ has accomplished great things in his life and been present during significant historic events.',
      poster_url: `${TMDB_IMG}/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg`,
      backdrop_url: 'https://image.tmdb.org/t/p/w1280/qdIMHd4sEfJSckfVJfKQvisL02a.jpg',
      vote_average: 8.5,
      release_year: 1994,
      genres: ['Comedy', 'Drama', 'Romance'],
      match: 96,
      hook: 'Life is like a box of chocolates.',
      providers: { flatrate: [{ name: 'Netflix' }] }
    },
    ...MOCK_MOVIES
  ],
  thriller: [
    {
      id: 807,
      title: 'Se7en',
      overview: 'Two detectives, a rookie and a veteran, hunt a serial killer who uses the seven deadly sins as his motives.',
      poster_url: `${TMDB_IMG}/6yoghtyTpznpBik8EngEmJskVUO.jpg`,
      backdrop_url: 'https://image.tmdb.org/t/p/w1280/ba4Vu0mK1981F54v9u3n47Q0yXU.jpg',
      vote_average: 8.4,
      release_year: 1995,
      genres: ['Crime', 'Mystery', 'Thriller'],
      match: 93,
      hook: 'Seven deadly sins. Seven ways to die.',
      providers: { flatrate: [{ name: 'Netflix' }, { name: 'Apple TV' }] }
    },
    ...MOCK_MOVIES
  ],
}

// ── Normaliser: maps backend shape → UI shape ────────────────────────────
export function normalise(item, index = 0) {
  // Rank-tiered match scoring descending from 96%
  const matchValues = [96, 93, 89, 86, 83, 81, 78, 75, 72, 70]
  const hooks = [
    'Layered realities. Impossible heists.',
    'Big ideas. Even bigger emotions.',
    'A mystery that changes everything.',
    'Atmospheric worlds. Human questions.',
    'Action-packed thrills await.',
    'A story you will not forget.',
    'Stunning visuals, deep story.',
    'Pure cinematic experience.',
  ]

  let genres = []
  if (Array.isArray(item.genres)) {
    genres = item.genres
  } else if (typeof item.genres === 'string' && item.genres) {
    genres = item.genres.split('|')
  }

  return {
    id:           item.id,
    title:        item.title || item.name || 'Unknown',
    overview:     item.overview || '',
    poster_url:   item.poster_url || null,
    backdrop_url: item.backdrop_url || null,
    vote_average: typeof item.vote_average === 'number' ? item.vote_average : 0,
    release_year: item.release_year || null,
    genres:       genres,
    match:        item.match || matchValues[index % matchValues.length],
    runtime:      item.runtime || null,
    rating:       item.rating || null,
    director:     item.director || null,
    cast:         item.cast || [],
    hook:         item.hook || hooks[index % hooks.length],
    providers:    item.providers || { flatrate: [], rent: [], buy: [] },
  }
}

// ── API Functions ────────────────────────────────────────────────────────────

/**
 * fetchRecommendations(title: string, limit?: number)
 * Calls GET /api/recommend?title={title}&limit={limit}
 * Returns { query, found, movies, isOffline: boolean }
 */
export async function fetchRecommendations(title, limit = 8) {
  try {
    const res = await fetch(
      `${BASE}/recommend?title=${encodeURIComponent(title)}&limit=${limit}`,
      { signal: AbortSignal.timeout(9000) }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return {
      query:     data.query,
      found:     data.found !== false,
      movies:    (data.results || []).map(normalise),
      isOffline: false,
    }
  } catch (err) {
    console.warn('[api] fetchRecommendations: backend unreachable, falling back to cached mock data', err)
    return {
      query:     title,
      found:     true,
      movies:    MOCK_MOVIES.map(normalise),
      isOffline: true,
    }
  }
}

/**
 * fetchDiscoverMovies(mood: string, mediaType: string)
 * Calls GET /api/discover?mood={mood}&type={mediaType}
 * Returns { movies: Movie[], isOffline: boolean }
 */
export async function fetchDiscoverMovies(mood = 'trending', mediaType = 'movie') {
  try {
    const res = await fetch(
      `${BASE}/discover?mood=${encodeURIComponent(mood)}&type=${encodeURIComponent(mediaType)}`,
      { signal: AbortSignal.timeout(9000) }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return {
      movies:    (data.results || []).map(normalise),
      isOffline: false,
    }
  } catch (err) {
    console.warn('[api] fetchDiscoverMovies: backend unreachable, falling back to cached mock data', err)
    const fallbackList = MOCK_DISCOVER[mood] || MOCK_MOVIES
    return {
      movies:    fallbackList.map(normalise),
      isOffline: true,
    }
  }
}

/**
 * fetchTrailerKey(id: number, mediaType: string)
 * Calls GET /api/trailer?id={id}&type={mediaType}
 * Returns { id, media_type, trailer_key: string | null, embed_url: string | null }
 */
export async function fetchTrailerKey(id, mediaType = 'movie') {
  try {
    const res = await fetch(
      `${BASE}/trailer?id=${id}&type=${encodeURIComponent(mediaType)}`,
      { signal: AbortSignal.timeout(7000) }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return {
      trailer_key: data.trailer_key || null,
      embed_url:   data.embed_url || null,
    }
  } catch (err) {
    console.warn('[api] fetchTrailerKey: trailer request failed', err)
    return {
      trailer_key: null,
      embed_url:   null,
    }
  }
}

// ── Backwards-compatible aliases ─────────────────────────────────────────────
export const getRecommendations = (title, limit) =>
  fetchRecommendations(title, limit).then(res => res)

export const discoverMovies = (mood, type) =>
  fetchDiscoverMovies(mood, type).then(res => res.movies)

export const getTrailer = (id, type) =>
  fetchTrailerKey(id, type)
