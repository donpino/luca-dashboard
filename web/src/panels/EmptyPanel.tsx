// Shared shell for a panel whose real implementation hasn't shipped yet.
// Binding per the nav-shell commit: no placeholder data, no sample numbers
// — an unbuilt panel says it is unbuilt. Replace this with the real panel
// component, one at a time, as each is built; do not add props here to make
// it do more than that.

interface EmptyPanelProps {
  title: string
}

export default function EmptyPanel({ title }: EmptyPanelProps) {
  return (
    <section className="panel" aria-label={title}>
      <h2 className="panel__title">{title}</h2>
      <p className="status-text status-text--muted">Not built yet</p>
    </section>
  )
}
