// §8.1 v1.35 card row — a decorative sphere, a name, a sub-line and one
// value. Shared by Today's "Your cards" and, since v1.40, the Week page.

import LiquidSphere from './LiquidSphere'

interface Props {
  name: string
  sub: string
  value: string
  color: string
}

export default function MetricRow({ name, sub, value, color }: Props) {
  return (
    <div className="row card">
      {/* decorative icon, fixed fill — carries no value (§8.1 v1.35) */}
      <LiquidSphere size={44} level={0.55} color={color} bubbles={false} />
      <div className="row__text">
        <span className="row__name">{name}</span>
        <span className="row__sub">{sub}</span>
      </div>
      <span className="row__value">{value}</span>
    </div>
  )
}
