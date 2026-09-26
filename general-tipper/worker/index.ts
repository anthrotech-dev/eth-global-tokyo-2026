import type { ResolveFailure } from '../shared/tipRouter.ts'
import { resolveProfile } from './resolve.ts'
import { ResolveError } from './safeFetch.ts'

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

function failure(code: ResolveFailure['code'], message: string, status: number): Response {
  const body: ResolveFailure = { ok: false, code, message }
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/resolve') {
      if (request.method !== 'GET') return failure('INVALID_URL', 'Use GET', 405)
      const target = url.searchParams.get('url')
      if (!target) return failure('INVALID_URL', 'Missing `url` query parameter', 400)

      const allowPrivate = env.ALLOW_PRIVATE_HOSTS === 'true'
      try {
        const result = await resolveProfile(target, allowPrivate, fetch)
        return new Response(JSON.stringify(result), { headers: JSON_HEADERS })
      } catch (e) {
        if (e instanceof ResolveError) return failure(e.code, e.message, e.status)
        console.error('resolve failed', e)
        return failure('FETCH_FAILED', 'Unexpected resolver error', 500)
      }
    }

    if (url.pathname.startsWith('/api/')) return failure('INVALID_URL', 'Unknown API route', 404)
    return new Response(null, { status: 404 })
  },
} satisfies ExportedHandler<Env>
