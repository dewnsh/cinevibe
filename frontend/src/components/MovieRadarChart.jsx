// src/components/MovieRadarChart.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Visual Explainability Radar Chart
// Plots 5 derived quality/reach metrics for any movie returned by the TMDB API,
// giving users a transparent "why was this recommended?" signal.
//
// ── 5 Metrics ────────────────────────────────────────────────────────────────
//  1. Rating        — TMDB vote_average (0–10) normalised to 0–100
//  2. Popularity    — TMDB popularity float, log-normalised (soft cap ~3000)
//  3. Audience Reach— vote_count, log-normalised (soft cap ~100 000 votes)
//  4. Recency       — release_year mapped linearly: 1970 → 0, current year → 100
//  5. Streamability — number of flatrate streaming providers (cap 5) → 0–100
//
// All metrics are clamped to [0, 100] so the axes are always consistent.
// ─────────────────────────────────────────────────────────────────────────────

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

// ── Metric derivation helpers ─────────────────────────────────────────────────

/** Clamp x to [0, 100] and round to 1 dp */
const clamp = (x) => Math.min(100, Math.max(0, Math.round(x * 10) / 10))

/**
 * Log-normalise a raw value.
 *   score = log(1 + raw) / log(1 + cap) * 100
 * Gives diminishing returns so extreme outliers don't crush everything else.
 */
const logNorm = (raw, cap) =>
  clamp((Math.log1p(raw ?? 0) / Math.log1p(cap)) * 100)

function deriveMetrics(movie) {
  const currentYear = new Date().getFullYear()

  // 1. Rating — vote_average is 0–10
  const rating = clamp((movie.vote_average ?? 0) * 10)

  // 2. Popularity — TMDB popularity ranges from ~1 (obscure) to ~3000+ (blockbuster)
  //    We use a soft cap of 2500 so superhits still score near 100 but don't dominate.
  const popularity = logNorm(movie.popularity ?? 0, 2500)

  // 3. Audience Reach — log-scale vote count, soft cap at 100 000 votes
  const audienceReach = logNorm(movie.vote_count ?? 0, 100_000)

  // 4. Recency — linear: 1970 → 0, currentYear → 100
  //    Films before 1970 get 0; future release_year gracefully clamps to 100.
  const year = movie.release_year ?? movie.release_date?.slice(0, 4) ?? currentYear
  const recency = clamp(((Number(year) - 1970) / (currentYear - 1970)) * 100)

  // 5. Streamability — count of flatrate providers (capped at 5 → full score)
  //    Reflects how easy it is to actually watch this movie right now.
  const flatrateCount = (movie.providers?.flatrate ?? []).length
  const streamability = clamp((flatrateCount / 5) * 100)

  return [
    { metric: 'Rating',         score: rating,        description: `${movie.vote_average?.toFixed(1) ?? '?'} / 10 on TMDB` },
    { metric: 'Popularity',     score: popularity,    description: `TMDB popularity index: ${(movie.popularity ?? 0).toFixed(0)}` },
    { metric: 'Audience Reach', score: audienceReach, description: `${(movie.vote_count ?? 0).toLocaleString()} votes cast` },
    { metric: 'Recency',        score: recency,       description: `Released in ${year}` },
    { metric: 'Streamability',  score: streamability, description: `${flatrateCount} streaming platform${flatrateCount !== 1 ? 's' : ''} available` },
  ]
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function RadarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { metric, score, description } = payload[0].payload
  return (
    <div className="bg-[#0f1117]/95 backdrop-blur-sm border border-white/10 rounded-xl px-3.5 py-2.5 shadow-2xl text-left max-w-[180px]">
      <p className="text-white text-[13px] font-semibold mb-0.5">{metric}</p>
      <p className="text-[#e50914] text-xs font-bold mb-1">{score} / 100</p>
      <p className="text-zinc-400 text-[11px] leading-snug">{description}</p>
    </div>
  )
}

// ── Custom polar axis tick (metric label) ─────────────────────────────────────

function AxisTick({ x, y, payload, cx, cy }) {
  const LABEL_OFFSET = 12

  // Push labels outward from center so they don't overlap the chart web
  const dx = x - cx
  const dy = y - cy
  const mag = Math.sqrt(dx * dx + dy * dy) || 1
  const lx = x + (dx / mag) * LABEL_OFFSET
  const ly = y + (dy / mag) * LABEL_OFFSET

  return (
    <text
      x={lx}
      y={ly}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="#a1a1aa"   // zinc-400
      fontSize={11}
      fontWeight={600}
      fontFamily="inherit"
    >
      {payload.value}
    </text>
  )
}

// ── Score legend strip ────────────────────────────────────────────────────────

function ScoreLegend({ data }) {
  return (
    <div className="grid grid-cols-5 gap-1 mt-3">
      {data.map(({ metric, score }) => {
        // Colour: red→amber→green via score threshold
        const colour =
          score >= 70 ? '#22c55e'   // green-500
          : score >= 45 ? '#f59e0b' // amber-400
          : '#e50914'               // brand red

        return (
          <div key={metric} className="flex flex-col items-center gap-0.5">
            <span
              className="text-[13px] font-bold tabular-nums"
              style={{ color: colour }}
            >
              {score}
            </span>
            <span className="text-[9px] text-zinc-600 text-center leading-tight">
              {metric}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function MovieRadarChart({ movie }) {
  if (!movie) return null

  const data = deriveMetrics(movie)

  // Determine if the movie has meaningful data to plot
  const hasData = data.some((d) => d.score > 0)

  return (
    <div className="select-none">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-white/[0.07]" />
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-zinc-500">
          Why This Movie?
        </span>
        <div className="h-px flex-1 bg-white/[0.07]" />
      </div>

      {!hasData ? (
        <p className="text-center text-zinc-600 text-xs py-4">
          Not enough TMDB data to render metrics.
        </p>
      ) : (
        <>
          {/* Radar chart */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ height: 230 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                data={data}
                cx="50%"
                cy="50%"
                outerRadius={78}
                margin={{ top: 16, right: 28, bottom: 16, left: 28 }}
              >
                {/* Concentric grid rings */}
                <PolarGrid
                  gridType="polygon"
                  stroke="rgba(255,255,255,0.07)"
                  strokeDasharray="3 3"
                />

                {/* Axis labels */}
                <PolarAngleAxis
                  dataKey="metric"
                  tick={<AxisTick />}
                  axisLine={false}
                  tickLine={false}
                />

                {/* Radius ticks — hidden; we show our own legend */}
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />

                {/* The filled radar surface */}
                <Radar
                  name={movie.title}
                  dataKey="score"
                  stroke="#e50914"
                  strokeWidth={1.8}
                  fill="#e50914"
                  fillOpacity={0.18}
                  dot={{ r: 3, fill: '#e50914', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#ffffff', stroke: '#e50914', strokeWidth: 1.5 }}
                />

                {/* Custom tooltip */}
                <Tooltip
                  content={<RadarTooltip />}
                  cursor={false}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Numeric score strip below chart */}
          <ScoreLegend data={data} />

          {/* Fine-print */}
          <p className="text-center text-[10px] text-zinc-700 mt-2.5 leading-snug">
            Scores derived from TMDB metrics · higher = stronger signal
          </p>
        </>
      )}
    </div>
  )
}

