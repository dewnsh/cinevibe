// src/components/MovieDetailModal.jsx
import { useEffect, useRef, useState } from 'react'
import { X, Play, Star, Plus, Check, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { fetchTrailerKey } from '../services/api'

const PROVIDER_CFG = {
  'Netflix':           { bg: '#e50914', label: 'N' },
  'Prime Video':       { bg: '#00A8E1', label: 'prime' },
  'Apple TV':          { bg: '#555555', label: 'Ctv+' },
  'Disney+ Hotstar':   { bg: '#1C4EDA', label: 'D+' },
}

function MetaPill({ label, value }) {
  if (!value) return null
  return (
    <span className="text-[13px] text-zinc-400">
      <span className="text-zinc-600 mr-1">{label}</span>{value}
    </span>
  )
}

export default function MovieDetailModal({ movie, onClose, inWatchlist, onWatchlistToggle }) {
  const overlayRef = useRef(null)
  const [trailerKey, setTrailerKey] = useState(null)
  const [trailerLoading, setTrailerLoading] = useState(true)
  const [imgErr, setImgErr] = useState(false)

  // Fetch trailer on mount
  useEffect(() => {
    setTrailerLoading(true)
    setTrailerKey(null)
    const mediaType = movie.media_type || 'movie'
    fetchTrailerKey(movie.id, mediaType).then(t => {
      setTrailerKey(t.trailer_key || null)
      setTrailerLoading(false)
    })
  }, [movie.id, movie.media_type])

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const providers = [
    ...(movie.providers?.flatrate || []),
    ...(movie.providers?.rent || []),
  ]

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className="relative w-full max-w-[720px] rounded-2xl overflow-hidden glass border border-white/[0.1] shadow-2xl"
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
      >
        {/* ── Trailer / Backdrop ─────────────────────────────────── */}
        <div className="relative w-full aspect-video bg-black">
          {trailerKey ? (
            <iframe
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
              title={`${movie.title} – Official Trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          ) : (
            // Fallback: backdrop image with play button overlay
            <div className="absolute inset-0">
              {!imgErr && movie.backdrop_url ? (
                <img
                  src={movie.backdrop_url}
                  alt={movie.title}
                  onError={() => setImgErr(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-black" />
              )}
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-3">
                {/* Fake player header bar */}
                <div className="absolute top-0 left-0 right-0 p-3 flex items-center gap-2">
                  <div className="w-5 h-5 bg-[#e50914] rounded flex items-center justify-center shrink-0">
                    <Play size={10} fill="white" stroke="none" />
                  </div>
                  <span className="text-white text-xs font-medium">
                    {movie.title} · Official Trailer
                  </span>
                </div>
                {/* Play button */}
                <button
                  className="w-16 h-16 rounded-full bg-[#e50914]/90 hover:bg-[#e50914] flex items-center justify-center transition-all hover:scale-110 shadow-lg shadow-red-900/40"
                  onClick={() => {
                    if (!trailerLoading) {
                      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' official trailer')}`, '_blank')
                    }
                  }}
                >
                  <Play size={28} fill="white" stroke="none" className="ml-1" />
                </button>
                {/* Fake progress bar */}
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                  <div className="flex items-center gap-3 text-white/70 text-xs">
                    <Play size={12} />
                    <div className="flex-1 h-0.5 bg-white/20 rounded-full">
                      <div className="w-0 h-full bg-white rounded-full" />
                    </div>
                    <span>0:00</span>
                    <span className="ml-auto">HD</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/70 border border-white/20 flex items-center justify-center hover:bg-black/90 transition-colors"
          >
            <X size={15} className="text-white" />
          </button>
        </div>

        {/* ── Detail body ────────────────────────────────────────── */}
        <div className="p-6 space-y-4">

          {/* Title row */}
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-2xl font-bold text-white leading-tight">{movie.title}</h2>
            <div className="flex flex-col items-end shrink-0">
              <div className="flex items-center gap-1.5">
                <Star size={16} fill="#f59e0b" stroke="none" />
                <span className="text-white text-xl font-bold">{movie.vote_average.toFixed(1)}</span>
              </div>
              <span className="text-zinc-500 text-[10px] tracking-wider uppercase mt-0.5">TMDB Rating</span>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#e50914]/20 text-[#e50914] border border-[#e50914]/30">
              {movie.match}% Match
            </span>
            <MetaPill label="" value={String(movie.release_year || '')} />
            {movie.runtime && <MetaPill label="" value={movie.runtime} />}
            {movie.rating && (
              <span className="text-[11px] border border-zinc-600 text-zinc-400 px-1.5 py-0.5 rounded">
                {movie.rating}
              </span>
            )}
            {movie.genres?.slice(0, 3).map(g => (
              <span key={g} className="text-zinc-400 text-[13px]">{g}</span>
            )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`dot-${i}`} className="text-zinc-600">·</span>, el], [])}
          </div>

          {/* Overview */}
          <p className="text-zinc-300 text-[14px] leading-relaxed line-clamp-3">
            {movie.overview}
          </p>

          {/* Director / Cast */}
          <div className="space-y-2.5 border-t border-white/[0.07] pt-4">
            {movie.director && (
              <div className="flex gap-4">
                <span className="text-zinc-500 text-sm w-16 shrink-0">Director</span>
                <span className="text-white text-sm font-medium">{movie.director}</span>
              </div>
            )}
            {movie.cast?.length > 0 && (
              <div className="flex gap-4">
                <span className="text-zinc-500 text-sm w-16 shrink-0">Cast</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {movie.cast.slice(0, 4).map(c => (
                    <span key={c} className="text-white text-sm">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Streaming providers */}
          {providers.length > 0 && (
            <div className="border-t border-white/[0.07] pt-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-zinc-500 text-sm shrink-0">Available On</span>
                {providers.slice(0, 3).map(p => {
                  const cfg = PROVIDER_CFG[p.name]
                  return (
                    <div key={p.name} className="flex items-center gap-1.5">
                      {cfg && (
                        <span
                          className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold text-white"
                          style={{ backgroundColor: cfg.bg }}
                        >
                          {cfg.label}
                        </span>
                      )}
                      <span className="text-white text-sm font-medium">{p.name}</span>
                    </div>
                  )
                })}
                {movie.providers?.country && (
                  <span className="text-zinc-500 text-xs">
                    Subscription · {movie.providers.country}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* CTA buttons */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button
              className="btn-brand flex items-center gap-2 px-5 py-2.5 text-sm"
              onClick={() => window.open(`https://www.netflix.com/search?q=${encodeURIComponent(movie.title)}`, '_blank')}
            >
              <Play size={15} fill="white" stroke="none" />
              Watch Now
            </button>

            <button
              onClick={() => onWatchlistToggle(movie)}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 text-sm rounded-lg border font-semibold transition-all duration-200',
                inWatchlist
                  ? 'bg-zinc-700 border-zinc-600 text-white'
                  : 'border-white/20 text-zinc-300 hover:border-white/40 hover:text-white'
              )}
            >
              {inWatchlist ? <Check size={15} /> : <Plus size={15} />}
              {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </button>

            {providers.length > 0 && (
              <button
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-auto"
                onClick={() => window.open(`https://www.justwatch.com/in/search?q=${encodeURIComponent(movie.title)}`, '_blank')}
              >
                Opens in {providers[0]?.name || 'Streaming'}
                <ExternalLink size={11} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
