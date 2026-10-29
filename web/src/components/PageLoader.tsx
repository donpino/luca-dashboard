// v1.40 — shown while a page's JSON loads, instead of a bare "Loading…" on
// black: one half-full sphere rocking gently. Fades in after a short beat,
// so a load that's already cached never flashes it.

import LiquidSphere from './LiquidSphere'

export default function PageLoader({ color = '#5AA2F0', text = 'LOADING' }: { color?: string; text?: string }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <LiquidSphere size={84} level={0.5} color={color} loading />
      <span className="page-loader__text">{text}</span>
    </div>
  )
}
