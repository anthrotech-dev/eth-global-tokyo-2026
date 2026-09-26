import type { ResolveFailure } from '../shared/tipRouter.ts'
import { handleDemo } from './demo.ts'
import { resolveProfile } from './resolve.ts'
import { ResolveError } from './safeFetch.ts'

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

function failure(code: ResolveFailure['code'], message: string, status: number): Response {
  const body: ResolveFailure = { ok: false, code, message }
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/**
 * Build a fetcher that serves this Worker's own fixture paths in-process, so the
 * resolver can target `<self>/demo/@alice` without a network round trip to itself.
 */
function makeSelfAwareFetcher(selfOrigin: string, env: Env): typeof fetch {
  return (input, init) => {
    const req = new Request(input, init)
    const u = new URL(req.url)
    if (u.origin === selfOrigin) {
      const local = handleDemo(req, env)
      if (local) return Promise.resolve(local)
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }
    return fetch(req)
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/resolve') {
      if (request.method !== 'GET') return failure('INVALID_URL', 'Use GET', 405)
      const target = url.searchParams.get('url')
      if (!target) return failure('INVALID_URL', 'Missing `url` query parameter', 400)

      // Wrangler's generated production type is the literal "false", while
      // .dev.vars may override it with "true" for local fixture resolution.
      const allowPrivate = (env.ALLOW_PRIVATE_HOSTS as string) === 'true'
      try {
        const result = await resolveProfile(target, allowPrivate, makeSelfAwareFetcher(url.origin, env))
        return new Response(JSON.stringify(result), { headers: JSON_HEADERS })
      } catch (e) {
        if (e instanceof ResolveError) return failure(e.code, e.message, e.status)
        console.error('resolve failed', e)
        return failure('FETCH_FAILED', 'Unexpected resolver error', 500)
      }
    }

    const demo = handleDemo(request, env)
    if (demo) return demo

    if (url.pathname.startsWith('/api/')) return failure('INVALID_URL', 'Unknown API route', 404)
    return new Response(null, { status: 404 })
  },
} satisfies ExportedHandler<Env>
