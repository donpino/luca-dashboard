// Cloudflare Worker in front of the static dashboard — DASHBOARD_SPEC.md §4,
// v1.36. Everything except /api/* is served straight from the built assets
// (wrangler.jsonc run_worker_first). /api/sync lets the athlete start a
// manual Garmin sync from the Today page:
//
//   GET  /api/sync  -> latest manual sync run + latest chained deploy run
//   POST /api/sync  -> dispatches sync.yml with include_today=true
//
// Three Worker secrets, set in the Cloudflare dashboard, never in this repo
// (CLAUDE.md rule 8): GITHUB_DISPATCH_TOKEN (fine-grained, Actions
// read/write on this repo only), ACCESS_TEAM_DOMAIN and ACCESS_AUD. Every
// /api request must carry a valid Cloudflare Access JWT for that team and
// application — Access already gates the hostname, this is the second
// check, and it fails closed if the secrets are missing.

import { decideDispatch, type RunInfo } from '../src/sync/syncStatus'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  GITHUB_DISPATCH_TOKEN?: string
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
}

const REPO = 'donpino/luca-dashboard'
const GH = `https://api.github.com/repos/${REPO}/actions`

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

// --- Cloudflare Access JWT (RS256) -------------------------------------------

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function verifyAccess(request: Request, env: Env): Promise<boolean> {
  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false
  const [h, p, sig] = token.split('.')
  if (!h || !p || !sig) return false
  const header = JSON.parse(new TextDecoder().decode(b64urlBytes(h)))
  const payload = JSON.parse(new TextDecoder().decode(b64urlBytes(p)))
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`
  const audOk = Array.isArray(payload.aud) ? payload.aud.includes(env.ACCESS_AUD) : payload.aud === env.ACCESS_AUD
  if (payload.iss !== issuer || !audOk || typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
    return false
  }
  const certs = (await (await fetch(`${issuer}/cdn-cgi/access/certs`)).json()) as { keys: (JsonWebKey & { kid: string })[] }
  const jwk = certs.keys.find((k) => k.kid === header.kid)
  if (!jwk) return false
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`))
}

// --- GitHub Actions ----------------------------------------------------------

function gh(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GH}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'luca-dashboard-worker',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  })
}

async function latestRun(env: Env, workflow: string, event: string): Promise<RunInfo | null> {
  const res = await gh(env, `/workflows/${workflow}/runs?event=${event}&per_page=1`)
  if (!res.ok) throw new Error(`github ${res.status}`)
  const body = (await res.json()) as { workflow_runs: RunInfo[] }
  const r = body.workflow_runs[0]
  return r ? { status: r.status, conclusion: r.conclusion, created_at: r.created_at } : null
}

async function state(env: Env) {
  const [sync, deploy] = await Promise.all([
    latestRun(env, 'sync.yml', 'workflow_dispatch'),
    latestRun(env, 'deploy.yml', 'workflow_run'),
  ])
  return { sync, deploy }
}

async function handleSync(request: Request, env: Env): Promise<Response> {
  if (!(await verifyAccess(request, env))) return json({ error: 'forbidden' }, 403)
  if (!env.GITHUB_DISPATCH_TOKEN) return json({ error: 'not_configured' }, 503)

  if (request.method === 'GET') return json(await state(env))
  if (request.method !== 'POST') return json({ error: 'method' }, 405)

  const current = await state(env)
  const decision = decideDispatch(current.sync, Date.now())
  if (!decision.ok) return json({ ...decision, ...current }, decision.reason === 'running' ? 409 : 429)

  const res = await gh(env, '/workflows/sync.yml/dispatches', {
    method: 'POST',
    body: JSON.stringify({ ref: 'main', inputs: { include_today: 'true' } }),
  })
  if (res.status !== 204) return json({ error: `github ${res.status}` }, 502)
  return json({ ok: true, started_at: new Date().toISOString() }, 202)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/sync') {
      try {
        return await handleSync(request, env)
      } catch {
        return json({ error: 'upstream' }, 502)
      }
    }
    return env.ASSETS.fetch(request)
  },
}
