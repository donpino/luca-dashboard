// §8.2 — the coach surface. Panel implementations land in later commits;
// this ships the seven panel slots as empty shells (nav-shell commit).
import EmptyPanel from '../panels/EmptyPanel'

export default function Week() {
  return (
    <>
      <EmptyPanel title="Planned vs actual km" />
      <EmptyPanel title="Ramp %" />
      <EmptyPanel title="Session compliance grid" />
      <EmptyPanel title="Easy-band compliance" />
      <EmptyPanel title="Medio control" />
      <EmptyPanel title="Wellness summary" />
      <EmptyPanel title="Generate check-in" />
    </>
  )
}
