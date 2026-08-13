// §8.3 — the mesocycle. Only the shin-vs-rolling-km panel exists so far;
// moved here unchanged from the old root App.tsx (nav-shell commit) — its
// range selector, hover tooltip, and v1.22 full-height understated-volume
// markArea all keep working exactly as before. The other four §8.3 panels
// land in later commits.
import ShinVolumePanel from '../panels/ShinVolumePanel'

export default function Block() {
  return <ShinVolumePanel />
}
