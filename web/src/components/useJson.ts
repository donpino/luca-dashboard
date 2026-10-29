// Fetches one pre-computed JSON file from /data/ — the same load/error/ready
// states every page already renders (Today.tsx v1.26), in one place.

import { useEffect, useState } from 'react'

export type LoadState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T }

// `file === null` fetches nothing and stays loading — lets a caller keep
// its hook calls unconditional while only one source is in use.
export function useJson<T>(file: string | null, version = 0): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  useEffect(() => {
    if (file === null) return
    let cancelled = false
    setState({ status: 'loading' })
    // version > 0 after a manual sync: bypass any cached copy of the file
    fetch(version ? `/data/${file}?v=${version}` : `/data/${file}`, version ? { cache: 'no-store' } : undefined)
      .then((res) => {
        if (!res.ok) throw new Error(`${file}: ${res.status}`)
        return res.json() as Promise<T>
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [file, version])
  return state
}
