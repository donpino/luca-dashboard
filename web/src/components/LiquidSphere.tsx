// §10 v1.35 signature element — a dark sphere filled to `level` (0..1) with
// a waved surface, a few bubbles and a soft highlight. Pure geometry: the
// level arrives pre-computed (score / 100, strain / 21) from the caller,
// which reads it straight off scores.json. `level === null` draws the empty
// sphere used for "calibrating" and "no data".
// v1.40/v1.41: on mount the liquid sloshes like a glass nudged on a table.
// Two motions, both damped to rest in ~2.5 s: the whole body tilts about
// the sphere's centre (so the surface's ends stay on the circle), and a
// travelling ripple rides the surface, changing its shape frame by frame
// before it settles back to the resting wave. Drawn per frame on the DOM
// nodes directly, not through React state. Off under
// prefers-reduced-motion. `loading` keeps it moving, for the page loader.

import { useEffect, useId, useRef } from 'react'

interface Props {
  size: number
  level: number | null
  color: string
  label?: string
  bubbles?: boolean
  loading?: boolean
}

const R = 48
const C = 50
const POINTS = 32
const REST_AMP = 2.2 // the resting wave, unchanged from v1.35

// Slosh tuning — a calibration of the look, not a measurement.
const TILT_DEG = 10
const RIPPLE_AMP = 4.5
const DECAY_S = 0.75
const TILT_HZ = 1.3
const RIPPLE_HZ = 1.6
const DURATION_S = 2.8

function clampLevel(level: number): number {
  return Math.max(0.04, Math.min(0.96, level))
}

// Surface height at u ∈ [0, 1] across the chord: the resting wave plus a
// travelling ripple. sin(πu) pins the ripple to zero at both ends, so the
// surface always meets the circle where the resting wave does.
function liquidPath(level: number, ripple: number, phase: number): { body: string; surface: string } {
  const y0 = C + R - 2 * R * clampLevel(level)
  const half = Math.sqrt(R * R - (y0 - C) ** 2)
  const xl = C - half
  const xr = C + half
  let wave = ''
  for (let i = 0; i <= POINTS; i++) {
    const u = i / POINTS
    const x = xl + (xr - xl) * u
    const y =
      y0 + REST_AMP * Math.sin(u * Math.PI * 3) + ripple * Math.sin(Math.PI * u) * Math.sin(2 * Math.PI * 1.25 * u - phase)
    wave += ` L${x.toFixed(2)},${y.toFixed(2)}`
  }
  const large = y0 < C ? 1 : 0
  return {
    body: `M${xl.toFixed(2)},${y0.toFixed(2)}${wave} A${R},${R} 0 ${large} 1 ${xl.toFixed(2)},${y0.toFixed(2)} Z`,
    surface: `M${xl.toFixed(2)},${y0.toFixed(2)}${wave}`,
  }
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function LiquidSphere({ size, level, color, label, bubbles = true, loading = false }: Props) {
  const id = useId().replace(/:/g, '')
  const groupRef = useRef<SVGGElement | null>(null)
  const bodyRef = useRef<SVGPathElement | null>(null)
  const surfaceRef = useRef<SVGPathElement | null>(null)
  const liquid = level === null ? null : liquidPath(level, 0, 0)
  const y0 = level === null ? 0 : C + R - 2 * R * clampLevel(level)

  useEffect(() => {
    if (level === null || reducedMotion()) return
    const g = groupRef.current
    const body = bodyRef.current
    const surface = surfaceRef.current
    if (!g || !body || !surface) return
    // a small random lag and direction so a row of spheres doesn't move in lockstep
    const lag = Math.random() * 0.14
    const dir = Math.random() < 0.5 ? -1 : 1
    let start: number | null = null
    let frame = 0
    const draw = (now: number) => {
      start ??= now
      const t = Math.max(0, (now - start) / 1000 - lag)
      const env = loading ? 1 : Math.exp(-t / DECAY_S)
      const tilt = dir * (loading ? 0.8 : 1) * TILT_DEG * env * Math.sin(2 * Math.PI * TILT_HZ * t)
      const ripple = (loading ? 0.7 : 1) * RIPPLE_AMP * env * Math.min(1, t * 6)
      const p = liquidPath(level, ripple, 2 * Math.PI * RIPPLE_HZ * t)
      g.setAttribute('transform', `rotate(${tilt.toFixed(2)} ${C} ${C})`)
      body.setAttribute('d', p.body)
      surface.setAttribute('d', p.surface)
      if (loading || t < DURATION_S) {
        frame = requestAnimationFrame(draw)
      } else {
        const rest = liquidPath(level, 0, 0)
        g.removeAttribute('transform')
        body.setAttribute('d', rest.body)
        surface.setAttribute('d', rest.surface)
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [level, loading])

  return (
    <svg
      className="sphere"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`lq${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity="0.72" />
        </linearGradient>
        <radialGradient id={`gl${id}`} cx="0.38" cy="0.28" r="0.45">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R} fill="#0C0E12" />
      {liquid && (
        <g ref={groupRef}>
          <path ref={bodyRef} d={liquid.body} fill={`url(#lq${id})`} />
          <path ref={surfaceRef} d={liquid.surface} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.2" />
          {bubbles && y0 + 14 < C + R - 6 && (
            <>
              <circle cx="38" cy={y0 + 14} r="1.6" fill="#fff" fillOpacity="0.35" />
              <circle cx="62" cy={Math.min(y0 + 22, C + R - 8)} r="1.1" fill="#fff" fillOpacity="0.35" />
            </>
          )}
        </g>
      )}
      <circle cx={C} cy={C} r={R} fill={`url(#gl${id})`} />
      <circle cx={C} cy={C} r={R - 0.5} fill="none" stroke={color} strokeOpacity="0.35" />
    </svg>
  )
}
