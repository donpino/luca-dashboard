// Fetches one pre-computed JSON file from /data/ — the same load/error/ready
// states every page already renders (Today.tsx v1.26), in one place.

import { useEffect, useState } from 'react'

export type LoadState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T }

export function useJson<T>(file: string): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    fetch(`/data/${file}`)
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
  }, [file])
  return state
}
