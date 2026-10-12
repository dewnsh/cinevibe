// src/components/MovieGrid.jsx
import { SortDesc } from 'lucide-react'
import MovieCard from './MovieCard'

function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden bg-[#13161b] border border-white/[0.07] animate-pulse">
      <div className="aspect-[2/3] bg-zinc-800/80" />
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-3 w-16 bg-zinc-700/60 rounded" />
          <div className="h-3 w-12 bg-zinc-800 rounded" />
        </div>
        <div className="h-4 w-3/4 bg-zinc-700/70 rounded" />
        <div className="h-3 w-full bg-zinc-800/80 rounded" />
        <div className="flex items-center justify-between pt-1">
          <div className="h-3.5 w-14 bg-zinc-800 rounded" />
          <div className="h-3.5 w-10 bg-zinc-800 rounded" />
        </div>
      </div>
    </div>
  )
}

export default function MovieGrid({
  movies,
  loading,
  headline,
  subline,
  selectedMovie,
  onSelect,
  watchlist,
  onWatchlistToggle,
}) {
  return (
    <section className="max-w-7xl mx-auto px-6 pt-6 pb-16">

      {/* Section header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white leading-tight">{headline}</h2>
          {subline && <p className="text-zinc-500 text-sm mt-0.5">{subline}</p>}
        </div>
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <span>Sort by</span>
          <button className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white hover:bg-white/[0.08] transition-colors">
            Best match
            <SortDesc size={14} className="text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
          : movies.map(movie => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onSelect={onSelect}
                inWatchlist={watchlist.some(w => w.id === movie.id)}
                onWatchlistToggle={onWatchlistToggle}
              />
            ))
        }
      </div>

      {/* Empty state */}
      {!loading && movies.length === 0 && (
        <div className="text-center py-24 text-zinc-600">
          <p className="text-5xl mb-4">🎬</p>
          <p className="text-lg font-semibold">No movies found.</p>
          <p className="text-sm mt-1">Try a different search or mood.</p>
        </div>
      )}
    </section>
  )
}
