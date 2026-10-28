// Duration formatting shared by the §8.2 Week panels (checkinCopy.ts,
// weekPanelsCopy.ts). The rest of this module served the pre-v1.35
// "Last night" panel and was removed with it.

export function formatMinutes(min: number | null): string {
  if (min === null) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}h ${m}m`
}
