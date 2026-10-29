// Fetches one pre-computed JSON file from /data/ — the same load/error/ready
// states every page already renders (Today.tsx v1.26), in one place.
// v1.40: responses are kept in memory for the session, so moving between
// tabs and detail pages renders at once instead of flashing a loader;
// `prefetchJson` warms the files the other tabs will ask for.

import { useEffect, useState } from 'react'

export type LoadState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T }

const cache = new Map<string, unknown>()
const inflight = new Map<string, Promise<unknown>>()

function load(file: string, version: number): Promise<unknown> {
  const key = `${file}@${version}`
  const pending = inflight.get(key)
  if (pending) return pending
  // version > 0 after a manual sync: bypass any cached copy of the file
  const p = fetch(version ? `/data/${file}?v=${version}` : `/data/${file}`, version ? { cache: 'no-store' } : undefined)
    .then((res) => {
      if (!res.ok) throw new Error(`${file}: ${res.status}`)
      return res.json()
    })
    .then((data) => {
      cache.set(file, data)
      return data
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export function prefetchJson(file: string): void {
  if (!cache.has(file)) load(file, 0).catch(() => {})
}

function initial<T>(file: string | null, version: number): LoadState<T> {
  return file !== null && !version && cache.has(file) ? { status: 'ready', data: cache.get(file) as T } : { status: 'loading' }
}

// `file === null` fetches nothing and stays loading — lets a caller keep
// its hook calls unconditional while only one source is in use.
export function useJson<T>(file: string | null, version = 0): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>(() => initial<T>(file, version))
  useEffect(() => {
    if (file === null) return
    const hit = initial<T>(file, version)
    setState(hit)
    if (hit.status === 'ready') return
    let cancelled = false
    load(file, version)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data: data as T })
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
