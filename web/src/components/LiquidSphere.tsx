// §10 v1.35 signature element — a dark sphere filled to `level` (0..1) with
// a waved surface, a few bubbles and a soft highlight. Pure geometry: the
// level arrives pre-computed (score / 100, strain / 21) from the caller,
// which reads it straight off scores.json. `level === null` draws the empty
// sphere used for "calibrating" and "no data". Static — nothing to switch
// off for prefers-reduced-motion.

import { useId } from 'react'

interface Props {
  size: number
  level: number | null
  color: string
  label?: string
  bubbles?: boolean
}

const R = 48
const C = 50

function liquidPath(level: number): { body: string; surface: string } {
  const p = Math.max(0.04, Math.min(0.96, level))
  const y0 = C + R - 2 * R * p
  const half = Math.sqrt(R * R - (y0 - C) ** 2)
  const xl = C - half
  const xr = C + half
  let wave = ''
  for (let i = 0; i <= 24; i++) {
    const x = xl + ((xr - xl) * i) / 24
    const y = y0 + 2.2 * Math.sin((i / 24) * Math.PI * 3)
    wave += ` L${x.toFixed(2)},${y.toFixed(2)}`
  }
  const large = y0 < C ? 1 : 0
  return {
    body: `M${xl.toFixed(2)},${y0.toFixed(2)}${wave} A${R},${R} 0 ${large} 1 ${xl.toFixed(2)},${y0.toFixed(2)} Z`,
    surface: `M${xl.toFixed(2)},${y0.toFixed(2)}${wave}`,
  }
}

export default function LiquidSphere({ size, level, color, label, bubbles = true }: Props) {
  const id = useId().replace(/:/g, '')
  const liquid = level === null ? null : liquidPath(level)
  const y0 = level === null ? 0 : C + R - 2 * R * Math.max(0.04, Math.min(0.96, level))
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
        <>
          <path d={liquid.body} fill={`url(#lq${id})`} />
          <path d={liquid.surface} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.2" />
          {bubbles && y0 + 14 < C + R - 6 && (
            <>
              <circle cx="38" cy={y0 + 14} r="1.6" fill="#fff" fillOpacity="0.35" />
              <circle cx="62" cy={Math.min(y0 + 22, C + R - 8)} r="1.1" fill="#fff" fillOpacity="0.35" />
            </>
          )}
        </>
      )}
      <circle cx={C} cy={C} r={R} fill={`url(#gl${id})`} />
      <circle cx={C} cy={C} r={R - 0.5} fill="none" stroke={color} strokeOpacity="0.35" />
    </svg>
  )
}
