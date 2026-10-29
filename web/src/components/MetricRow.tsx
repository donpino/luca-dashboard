// §8.1 v1.35 card row — a decorative sphere, a name, a sub-line and one
// value. Shared by Today's "Your cards" and, since v1.40, the Week page.
// v1.41: with `onOpen` the row is a button that opens its detail page.

import LiquidSphere from './LiquidSphere'

interface Props {
  name: string
  sub: string
  value: string
  color: string
  onOpen?: () => void
}

export default function MetricRow({ name, sub, value, color, onOpen }: Props) {
  const Tag = onOpen ? 'button' : 'div'
  return (
    <Tag className={onOpen ? 'row card row--button' : 'row card'} {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})}>
      {/* decorative icon, fixed fill — carries no value (§8.1 v1.35) */}
      <LiquidSphere size={44} level={0.55} color={color} bubbles={false} />
      <div className="row__text">
        <span className="row__name">{name}</span>
        <span className="row__sub">{sub}</span>
      </div>
      <span className="row__value">{value}</span>
      {onOpen && (
        <svg className="chev row__chev" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </Tag>
  )
}
