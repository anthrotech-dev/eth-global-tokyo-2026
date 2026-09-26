import type { ResolveErrorCode } from '../shared/tipRouter.ts'

export class ResolveError extends Error {
  code: ResolveErrorCode
  status: number
  constructor(code: ResolveErrorCode, message: string, status: number) {
    super(message)
    this.name = 'ResolveError'
    this.code = code
    this.status = status
  }
}

export type SafeFetchOpts = {
  accept: string
  timeoutMs: number
  maxBytes: number
  allowPrivate: boolean
  /** Injected so same-origin (fixture) targets can be served in-process. */
  fetcher?: typeof fetch
}

export type FetchedText = {
  status: number
  finalUrl: string
  contentType: string | null
  text: string
}

const PRIVATE_V4 = [
  [0x00000000, 0xff000000], // 0.0.0.0/8
  [0x0a000000, 0xff000000], // 10.0.0.0/8
  [0x7f000000, 0xff000000], // 127.0.0.0/8
  [0xa9fe0000, 0xffff0000], // 169.254.0.0/16
  [0xac100000, 0xfff00000], // 172.16.0.0/12
  [0xc0a80000, 0xffff0000], // 192.168.0.0/16
] as const

function ipv4ToInt(host: string): number | null {
  const parts = host.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.local') || h.endsWith('.internal')) return true

  const v4 = ipv4ToInt(h)
  if (v4 !== null) {
    return PRIVATE_V4.some(([net, mask]) => ((v4 & mask) >>> 0) === net)
  }

  // IPv6 literal (URL keeps the brackets).
  if (h.startsWith('[') && h.endsWith(']')) {
    const v6 = h.slice(1, -1)
    if (v6 === '::1' || v6 === '::') return true
    if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true // fc00::/7
    if (/^fe[89ab][0-9a-f]:/.test(v6)) return true // fe80::/10
    if (v6.startsWith('::ffff:')) {
      const mapped = ipv4ToInt(v6.slice(7))
      if (mapped !== null) return PRIVATE_V4.some(([net, mask]) => ((mapped & mask) >>> 0) === net)
    }
  }
  return false
}

/**
 * Best-effort SSRF guard. Workers cannot resolve DNS ahead of the fetch, so this
 * only inspects the literal hostname; a public name pointing at a private address
 * is not caught. Good enough for a demo resolver.
 */
export function assertPublicHttpUrl(u: URL, allowPrivate: boolean): void {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ResolveError('UNSUPPORTED_SCHEME', `Unsupported scheme: ${u.protocol}`, 400)
  }
  if (!allowPrivate && isPrivateHostname(u.hostname)) {
    throw new ResolveError('PRIVATE_HOST', `Refusing to fetch private host: ${u.hostname}`, 400)
  }
}

/** Fetch a text body with timeout and size cap. Throws ResolveError on transport failures. */
export async function safeFetchText(u: URL, opts: SafeFetchOpts): Promise<FetchedText> {
  assertPublicHttpUrl(u, opts.allowPrivate)
  const doFetch = opts.fetcher ?? fetch

  let res: Response
  try {
    res = await doFetch(u.href, {
      method: 'GET',
      headers: {
        Accept: opts.accept,
        'User-Agent': 'TipRouter-Resolver/0.1 (+https://github.com/totegamma/eth-global-tokyo-2026)',
      },
      // NOTE: redirects are followed without re-checking the target host.
      redirect: 'follow',
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new ResolveError('TIMEOUT', `Timed out fetching ${u.href}`, 504)
    }
    throw new ResolveError('FETCH_FAILED', `Failed to fetch ${u.href}: ${(e as Error).message}`, 502)
  }

  const text = await readTextCapped(res, opts.maxBytes, u.href)
  return {
    status: res.status,
    finalUrl: res.url || u.href,
    contentType: res.headers.get('content-type'),
    text,
  }
}

async function readTextCapped(res: Response, maxBytes: number, href: string): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new ResolveError('TOO_LARGE', `Response from ${href} exceeded ${maxBytes} bytes`, 502)
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    merged.set(c, off)
    off += c.byteLength
  }
  return new TextDecoder().decode(merged)
}
