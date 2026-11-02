// src/components/CompatibilityMixer.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Dual-User Compatibility Mixer
// Finds the cinematic "taste midpoint" between two movies and suggests
// compromise picks that both users are likely to enjoy.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Shuffle, Search, AlertCircle, Sparkles, Film, Loader2, X } from 'lucide-react'
import { fetchCompatibility } from '../services/api'

// ── Genre pill colours (cycles through a fixed palette) ──────────────────────
const GENRE_COLOURS = [
  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'bg-rose-500/20 text-rose-300 border-rose-500/30',
  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
]

function GenrePill({ genre, index }) {
  return (
    <span
      className={`text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border ${GENRE_COLOURS[index % GENRE_COLOURS.length]}`}
    >
      {genre}
    </span>
  )
}

// ── Compatibility score arc / badge ──────────────────────────────────────────
function CompatBadge({ score }) {
  // score is 0–100
  const hue = Math.round((score / 100) * 120)  // red→green
  return (
    <div
      className="flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center text-[11px] font-bold"
      style={{ borderColor: `hsl(${hue},70%,55%)`, color: `hsl(${hue},70%,65%)` }}
      title={`Compatibility score: ${score}`}
    >
      {score}
    </div>
  )
}

// ── Single result row ─────────────────────────────────────────────────────────
function ResultRow({ item }) {
  return (
    <li className="flex items-center gap-3 py-3 border-b border-white/[0.06] last:border-0 group">
      {/* Rank */}
      <span className="text-zinc-600 text-xs font-mono w-4 shrink-0 text-center">
        {item.rank}
      </span>

      {/* Title + genres */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate group-hover:text-[#e50914] transition-colors">
          {item.title}
        </p>
        {item.genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.genres.slice(0, 3).map((g, i) => (
              <GenrePill key={g} genre={g} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* Compat score */}
      <CompatBadge score={item.compatibility_score} />
    </li>
  )
}

// ── Movie Input field ─────────────────────────────────────────────────────────
function MovieInput({ label, value, onChange, placeholder, found, searched }) {
  const showWarning = searched && !found

  return (
    <div className="flex-1 min-w-0">
      <label className="block text-[11px] font-bold tracking-[0.15em] uppercase text-zinc-500 mb-2">
        {label}
      </label>
      <div
        className={`flex items-center gap-2 bg-[#13161b] border rounded-xl px-3 py-2.5 transition-all
          focus-within:ring-1
          ${showWarning
            ? 'border-amber-500/40 focus-within:ring-amber-500/20'
            : 'border-white/[0.1] focus-within:border-white/20 focus-within:ring-white/10'
          }`}
      >
        <Film size={15} className={showWarning ? 'text-amber-400' : 'text-zinc-500'} />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-white placeholder-zinc-600 text-sm outline-none min-w-0"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {showWarning && (
        <p className="mt-1.5 text-amber-400 text-[11px] flex items-center gap-1">
          <AlertCircle size={11} />
          Not found in ML index
        </p>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CompatibilityMixer() {
  const [t1, setT1] = useState('')
  const [t2, setT2] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)   // null | API response
  const [error, setError]   = useState(null)   // null | string

  const canSubmit = t1.trim().length > 0 && t2.trim().length > 0 && !loading

  async function handleMix(e) {
    e.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    setResult(null)
    setError(null)

    const data = await fetchCompatibility(t1.trim(), t2.trim(), 5)

    if (data.isOffline) {
      setError('Backend unreachable — make sure the CineVibe server is running.')
    } else if (!data.found1 && !data.found2) {
      setError('Neither movie was found in the offline ML dataset. Try well-known titles like "Inception" or "The Dark Knight".')
    } else {
      setResult(data)
    }

    setLoading(false)
  }

  const searched = result !== null

  return (
    <section className="max-w-2xl mx-auto px-4 py-10">
      {/* Header ──────────────────────────────────────────────── */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-1.5 mb-4">
          <Shuffle size={13} className="text-violet-400" />
          <span className="text-violet-300 text-[11px] font-bold tracking-[0.15em] uppercase">
            Dual-User Compatibility
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-2">
          Find your cinematic midpoint.
        </h2>
        <p className="text-zinc-400 text-sm max-w-md mx-auto leading-relaxed">
          Enter two movies — one per person — and we'll find the perfect compromise
          that sits at the mathematical taste midpoint between them.
        </p>
      </div>

      {/* Input card ──────────────────────────────────────────── */}
      <form
        onSubmit={handleMix}
        className="bg-[#0f1117] border border-white/[0.07] rounded-2xl p-6 mb-6 shadow-xl"
      >
        <div className="flex flex-col sm:flex-row gap-4 mb-5">
          <MovieInput
            label="Movie 1"
            value={t1}
            onChange={setT1}
            placeholder="e.g. Inception"
            found={result?.found1 ?? true}
            searched={searched}
          />

          {/* Divider */}
          <div className="flex sm:flex-col items-center justify-center gap-1 shrink-0">
            <div className="h-px sm:h-8 w-8 sm:w-px bg-white/10" />
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
              &amp;
            </span>
            <div className="h-px sm:h-8 w-8 sm:w-px bg-white/10" />
          </div>

          <MovieInput
            label="Movie 2"
            value={t2}
            onChange={setT2}
            placeholder="e.g. The Dark Knight"
            found={result?.found2 ?? true}
            searched={searched}
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm
            bg-gradient-to-r from-violet-600 to-[#e50914] hover:from-violet-500 hover:to-red-500
            text-white shadow-lg shadow-violet-900/30 transition-all
            disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Computing midpoint…
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Find Compromise Movies
            </>
          )}
        </button>
      </form>

      {/* Error banner ────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm mb-6">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Results card ────────────────────────────────────────── */}
      {result && result.results.length > 0 && (
        <div className="bg-[#0f1117] border border-white/[0.07] rounded-2xl overflow-hidden shadow-xl">
          {/* Card header */}
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-zinc-500 mb-0.5">
                Taste Midpoint Results
              </p>
              <p className="text-sm text-white font-semibold">
                <span className="text-[#e50914]">{result.title1}</span>
                <span className="text-zinc-500 mx-2">×</span>
                <span className="text-violet-400">{result.title2}</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
              <Search size={12} />
              {result.results.length} picks
            </div>
          </div>

          {/* Partial-found notice */}
          {(!result.found1 || !result.found2) && (
            <div className="flex items-center gap-2.5 px-5 py-2.5 bg-amber-500/5 border-b border-amber-500/10 text-amber-300 text-[11px]">
              <AlertCircle size={12} className="shrink-0" />
              {!result.found1 && !result.found2
                ? 'Both movies were outside the local index — no results.'
                : `"${!result.found1 ? result.title1 : result.title2}" wasn't in the ML index; results are based on the other movie only.`}
            </div>
          )}

          {/* Results list */}
          <ul className="px-5 divide-y-0">
            {result.results.map(item => (
              <ResultRow key={item.id} item={item} />
            ))}
          </ul>

          {/* Footer hint */}
          <div className="px-5 py-3 border-t border-white/[0.06]">
            <p className="text-[11px] text-zinc-600 text-center">
              Score = rank-decay average · higher means closer to both taste profiles
            </p>
          </div>
        </div>
      )}

      {/* Empty state after a search with no results ─────────── */}
      {result && result.results.length === 0 && !error && (
        <div className="text-center py-10 text-zinc-500 text-sm">
          <Film size={32} className="mx-auto mb-3 opacity-30" />
          No overlapping recommendations found for this pair.
        </div>
      )}
    </section>
  )
}

