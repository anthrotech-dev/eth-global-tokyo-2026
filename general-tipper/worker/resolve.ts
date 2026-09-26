import {
  NETWORKS,
  NETWORK_NAMES,
  PAY_NETWORK,
  WELL_KNOWN_PATH,
  canonicalizeTargetURI,
  extractTipjars,
  feeBpsToRatioBps,
  parseWellKnown,
  type HostInfo,
  type Network,
  type ResolveResult,
} from '../shared/tipRouter.ts'
import { ResolveError, safeFetchText } from './safeFetch.ts'

const PROFILE_TIMEOUT_MS = 8_000
const PROFILE_MAX_BYTES = 1024 * 1024
const WELL_KNOWN_TIMEOUT_MS = 5_000
const WELL_KNOWN_MAX_BYTES = 16 * 1024

/** For ActivityPub JSON, look at the fields most likely to carry the bio first. */
function activityPubSearchText(text: string): string {
  try {
    const j = JSON.parse(text) as Record<string, unknown>
    const parts: string[] = []
    if (typeof j.summary === 'string') parts.push(j.summary)
    if (typeof j.name === 'string') parts.push(j.name)
    if (Array.isArray(j.attachment)) {
      for (const a of j.attachment) {
        if (a && typeof a === 'object') {
          const v = (a as Record<string, unknown>).value
          if (typeof v === 'string') parts.push(v)
        }
      }
    }
    parts.push(text)
    return parts.join('\n')
  } catch {
    return text
  }
}

async function resolveHost(origin: string, allowPrivate: boolean, fetcher: typeof fetch): Promise<HostInfo> {
  const url = origin + WELL_KNOWN_PATH
  try {
    const res = await safeFetchText(new URL(url), {
      accept: 'application/json, */*;q=0.1',
      timeoutMs: WELL_KNOWN_TIMEOUT_MS,
      maxBytes: WELL_KNOWN_MAX_BYTES,
      allowPrivate,
      fetcher,
    })
    if (res.status === 404) return { status: 'missing', url, tipjar: null, tipjars: {}, feeBps: 0, reason: 'not-found' }
    if (res.status < 200 || res.status >= 300) {
      return { status: 'invalid', url, tipjar: null, tipjars: {}, feeBps: 0, reason: 'fetch-failed' }
    }
    return parseWellKnown(res.text, url)
  } catch {
    return { status: 'invalid', url, tipjar: null, tipjars: {}, feeBps: 0, reason: 'fetch-failed' }
  }
}

export async function resolveProfile(rawUrl: string, allowPrivate: boolean, fetcher: typeof fetch): Promise<ResolveResult> {
  let targetURI: string
  try {
    targetURI = canonicalizeTargetURI(rawUrl)
  } catch {
    throw new ResolveError('INVALID_URL', `Invalid URL: ${rawUrl}`, 400)
  }
  const target = new URL(targetURI)

  const page = await safeFetchText(target, {
    accept: 'text/html, application/activity+json;q=0.9, application/ld+json;q=0.8, */*;q=0.1',
    timeoutMs: PROFILE_TIMEOUT_MS,
    maxBytes: PROFILE_MAX_BYTES,
    allowPrivate,
    fetcher,
  })
  if (page.status < 200 || page.status >= 300) {
    throw new ResolveError('UPSTREAM_STATUS', `Profile responded with HTTP ${page.status}`, 502)
  }

  const isJson = /json/i.test(page.contentType ?? '')
  const extracted = extractTipjars(isJson ? activityPubSearchText(page.text) : page.text)
  const payableNetworks = NETWORK_NAMES.filter((network) => NETWORKS[network].payable && extracted.tipjars[network] !== undefined)
  const network = payableNetworks[0]
  const receiver = network ? extracted.tipjars[network] : undefined
  if (receiver === undefined) {
    if (extracted.invalid[PAY_NETWORK] === 'BAD_CHECKSUM') {
      throw new ResolveError('BAD_CHECKSUM', `${PAY_NETWORK}: address on the profile has an invalid checksum`, 422)
    }
    const others = (Object.keys(extracted.tipjars) as Network[]).map((n) => NETWORKS[n].label)
    const hint = others.length ? ` (found only: ${others.join(', ')})` : ''
    throw new ResolveError('NO_TIPJAR', `No supported tipjar declaration found on the profile${hint}`, 404)
  }

  const host = await resolveHost(target.origin, allowPrivate, fetcher)

  return {
    ok: true,
    targetURI,
    origin: target.origin,
    network,
    receiver,
    receiverTipjars: extracted.tipjars,
    receiverSource: {
      url: page.finalUrl,
      contentType: page.contentType,
      candidates: extracted.candidates[network] ?? 0,
    },
    host,
    ratioBps: host.status === 'ok' ? feeBpsToRatioBps(host.feeBps) : feeBpsToRatioBps(0),
    resolvedAt: new Date().toISOString(),
  }
}
