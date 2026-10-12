// src/components/HeroSearch.jsx
import { useState } from 'react'
import { Search, Sparkles } from 'lucide-react'

export default function HeroSearch({ onSearch, loading }) {
  const [query, setQuery] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (query.trim()) onSearch(query.trim())
  }

  return (
    <section className="pt-14 pb-10 text-center px-6">
      {/* Eyebrow tagline */}
      <p className="text-[#e50914] text-xs font-bold tracking-[0.2em] uppercase mb-4">
        Less Scrolling. More Cinema.
      </p>

      {/* Headline */}
      <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
        Find your next favorite story.
      </h1>

      {/* Subhead */}
      <p className="text-zinc-400 text-base mb-10 max-w-xl mx-auto leading-relaxed">
        Powered by content similarity &amp; dynamic mood filtering.
      </p>

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="max-w-[580px] mx-auto">
        <div className="flex items-center gap-0 bg-[#13161b] border border-white/[0.1] rounded-xl overflow-hidden focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/10 transition-all">
          <div className="pl-4 pr-3 text-zinc-500 shrink-0">
            <Search size={18} />
          </div>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a movie you loved (e.g. Inception)..."
            className="flex-1 bg-transparent text-white placeholder-zinc-500 text-[15px] py-3.5 outline-none min-w-0"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="btn-brand flex items-center gap-2 px-5 py-3.5 m-1.5 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Sparkles size={15} strokeWidth={2.5} />
            {loading ? 'Finding…' : 'Find Similar'}
          </button>
        </div>
      </form>
    </section>
  )
}
