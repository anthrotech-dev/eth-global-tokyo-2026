import type { ResolveResponse, ResolveResult } from '../../shared/tipRouter.ts'

export class ResolveRequestError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ResolveRequestError'
    this.code = code
  }
}

/** Ask the Worker to resolve a profile URL into receiver/host addresses. */
export async function resolveTarget(url: string): Promise<ResolveResult> {
  const res = await fetch(`/api/resolve?url=${encodeURIComponent(url)}`, { cache: 'no-store' })
  let body: ResolveResponse
  try {
    body = (await res.json()) as ResolveResponse
  } catch {
    throw new ResolveRequestError('BAD_RESPONSE', `Resolver returned HTTP ${res.status} with a non-JSON body`)
  }
  if (!body.ok) throw new ResolveRequestError(body.code, `${body.code}: ${body.message}`)
  return body
}
