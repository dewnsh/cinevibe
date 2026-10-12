import { useState, useEffect, useMemo, useCallback } from 'react'
import { AlertCircle, WifiOff } from 'lucide-react'
import Navbar from './components/Navbar'
import HeroSearch from './components/HeroSearch'
import FilterBar from './components/FilterBar'
import MovieGrid from './components/MovieGrid'
import MovieDetailModal from './components/MovieDetailModal'
import { fetchRecommendations, fetchDiscoverMovies } from './services/api'

export default function App() {
  const [mediaType, setMediaType] = useState('movie')
  const [activeMood, setActiveMood] = useState('trending')
  const [activeOTT, setActiveOTT] = useState([])
  const [movies, setMovies] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [isWatchlistView, setIsWatchlistView] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [headline, setHeadline] = useState('TRENDING TONIGHT')
  const [subline, setSubline] = useState('Most streamed and critically acclaimed cinema right now')

  // Error & offline banners
  const [isOffline, setIsOffline] = useState(false)
  const [searchNotice, setSearchNotice] = useState(null)

  // Load watchlist from localStorage
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem('cinevibe_watchlist')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Persist watchlist changes
  useEffect(() => {
    try {
      localStorage.setItem('cinevibe_watchlist', JSON.stringify(watchlist))
    } catch (e) {
      console.warn('Failed to save watchlist to localStorage', e)
    }
  }, [watchlist])

  // Fetch movies by mood
  const loadMood = useCallback(async (mood, type) => {
    setLoading(true)
    setSearchQuery('')
    setSearchNotice(null)
    setIsWatchlistView(false)

    const moodHeadlines = {
      trending: 'TRENDING TONIGHT',
      scifi:    'MIND-BENDING SCI-FI',
      feelgood: 'FEEL-GOOD & COZY',
      thriller: 'LATE NIGHT THRILLER',
      action:   'POPCORN ACTION',
    }

    setHeadline(moodHeadlines[mood] || 'RECOMMENDED FOR YOU')
    setSubline(
      type === 'tv'
        ? 'Top trending series matching your selected vibe'
        : 'Curated based on cinematic tone, critical reception, and pacing'
    )

    try {
      const res = await fetchDiscoverMovies(mood, type)
      setMovies(res.movies || [])
      setIsOffline(Boolean(res.isOffline))
    } catch (err) {
      console.error('Error fetching discovery movies:', err)
      setIsOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial mount: automatically trigger fetchDiscoverMovies('trending', 'movie')
  useEffect(() => {
    loadMood('trending', 'movie')
  }, [loadMood])

  // Search recommendation submission handler
  const handleSearch = async (query) => {
    if (!query.trim()) return
    setLoading(true)
    setSearchQuery(query)
    setIsWatchlistView(false)
    setSearchNotice(null)
    setHeadline(`BECAUSE YOU LOVED "${query.toUpperCase()}"`)
    setSubline('Ranked by cosine thematic similarity, director aesthetic, and cast overlap')

    try {
      const data = await fetchRecommendations(query, 8)
      setMovies(data.movies || [])
      setIsOffline(Boolean(data.isOffline))

      if (!data.found) {
        setSearchNotice(
          'Movie not found in offline ML index — showing closest TMDB matches'
        )
      } else {
        setSearchNotice(null)
      }
    } catch (err) {
      console.error('Error fetching recommendations:', err)
      setIsOffline(true)
    } finally {
      setLoading(false)
    }
  }

  // Mood selection change
  const handleMoodSelect = (moodId) => {
    setActiveMood(moodId)
    loadMood(moodId, mediaType)
  }

  // Media type toggle ([Movies | TV Shows])
  const handleMediaTypeChange = (type) => {
    setMediaType(type)
    if (!isWatchlistView) {
      if (searchQuery) {
        // If searched, re-run search or reset to discover for new type
        handleSearch(searchQuery)
      } else {
        loadMood(activeMood, type)
      }
    }
  }

  // Watchlist toggle handler
  const handleWatchlistToggle = (movie) => {
    setWatchlist((prev) => {
      const exists = prev.some((m) => m.id === movie.id)
      if (exists) {
        return prev.filter((m) => m.id !== movie.id)
      } else {
        return [movie, ...prev]
      }
    })
  }

  // Filter movies by active streaming OTT services
  const displayedMovies = useMemo(() => {
    const sourceList = isWatchlistView ? watchlist : movies
    if (!activeOTT || activeOTT.length === 0) {
      return sourceList
    }

    const providerMap = {
      netflix: 'Netflix',
      prime:   'Prime Video',
      hotstar: 'Disney+ Hotstar',
      appletv: 'Apple TV',
    }

    const selectedProviderNames = activeOTT.map((id) => providerMap[id]).filter(Boolean)

    return sourceList.filter((m) => {
      const flatrate = m.providers?.flatrate || []
      return flatrate.some((p) =>
        selectedProviderNames.some((target) => p.name.toLowerCase().includes(target.toLowerCase()))
      )
    })
  }, [isWatchlistView, watchlist, movies, activeOTT])

  // Watchlist navigation toggle
  const handleWatchlistNavClick = () => {
    if (isWatchlistView) {
      setIsWatchlistView(false)
      loadMood(activeMood, mediaType)
    } else {
      setIsWatchlistView(true)
      setSearchQuery('')
      setSearchNotice(null)
      setHeadline('MY SAVED WATCHLIST')
      setSubline(
        watchlist.length > 0
          ? `${watchlist.length} saved titles ready for your next movie night`
          : 'Your watchlist is empty. Click the plus button on any poster to bookmark titles!'
      )
    }
  }

  const handleLogoClick = () => {
    setIsWatchlistView(false)
    setSearchQuery('')
    setSearchNotice(null)
    setActiveMood('trending')
    loadMood('trending', mediaType)
  }

  return (
    <div className="min-h-screen bg-[#0b0d10] text-white flex flex-col font-sans selection:bg-[#e50914] selection:text-white">
      {/* Sticky Glass Navbar */}
      <Navbar
        mediaType={mediaType}
        setMediaType={handleMediaTypeChange}
        watchlist={watchlist}
        onWatchlistClick={handleWatchlistNavClick}
        isWatchlistView={isWatchlistView}
        onLogoClick={handleLogoClick}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {/* Subtle Offline Warning Banner if backend unreachable */}
        {isOffline && (
          <div className="max-w-7xl mx-auto px-6 pt-4">
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs sm:text-sm">
              <WifiOff size={16} className="text-amber-400 shrink-0" />
              <span>
                Backend server currently unreachable &mdash; displaying offline cached demo data. Live search &amp; trailers will activate once connected.
              </span>
            </div>
          </div>
        )}

        {/* Hero Search Section (shown in discovery / search mode) */}
        {!isWatchlistView && (
          <>
            <HeroSearch onSearch={handleSearch} loading={loading} />

            {/* Filter Bar with Mood Pills & OTT Badges */}
            <FilterBar
              activeMood={activeMood}
              setActiveMood={handleMoodSelect}
              activeOTT={activeOTT}
              setActiveOTT={setActiveOTT}
            />
          </>
        )}

        {/* Not-in-ML-Index Friendly Banner */}
        {searchNotice && !isWatchlistView && (
          <div className="max-w-7xl mx-auto px-6 pt-4">
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs sm:text-sm">
              <AlertCircle size={16} className="text-blue-400 shrink-0" />
              <span>{searchNotice}</span>
            </div>
          </div>
        )}

        {/* Movie Grid Section */}
        <MovieGrid
          movies={displayedMovies}
          loading={loading}
          headline={headline}
          subline={subline}
          selectedMovie={selectedMovie}
          onSelect={setSelectedMovie}
          watchlist={watchlist}
          onWatchlistToggle={handleWatchlistToggle}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-zinc-500">
        <p className="flex items-center justify-center gap-1.5">
          <span>CineVibe &copy; {new Date().getFullYear()}</span>
          <span>&middot;</span>
          <span>Designed with high-contrast cinema aesthetics</span>
          <span>&middot;</span>
          <span>Data via TMDB API</span>
        </p>
      </footer>

      {/* Movie Detail & Trailer Modal */}
      {selectedMovie && (
        <MovieDetailModal
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          inWatchlist={watchlist.some((w) => w.id === selectedMovie.id)}
          onWatchlistToggle={handleWatchlistToggle}
        />
      )}
    </div>
  )
}
