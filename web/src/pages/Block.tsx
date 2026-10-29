// §8.3 — the mesocycle. Only the shin-vs-rolling-km panel exists so far,
// in the §10 v1.35 visual system since v1.40; its range selector, hover
// tooltip, and v1.22 full-height understated-volume markArea all work as
// before. The other four §8.3 panels land in later commits.
import ShinVolumePanel from '../panels/ShinVolumePanel'

export default function Block() {
  return (
    <div className="screen screen--block">
      <header className="detail-head">
        <h1 className="detail-head__title">Block</h1>
        <p className="detail-head__sub">Shin against running load</p>
      </header>
      <ShinVolumePanel />
    </div>
  )
}
