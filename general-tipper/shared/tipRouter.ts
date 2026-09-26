/**
 * TipRouter protocol primitives shared by the Cloudflare Worker (resolver)
 * and the browser client (verifier). Pure functions only: no fetch, no DOM.
 *
 * Tipjars are advertised per network, e.g. `ethereum:0x…` in a profile bio and
 * `{"tipjars":{"ethereum":"0x…"}}` in /.well-known/tip-router, so other chains
 * (sui, …) can be added without changing the wire format.
 */
import { getAddress, isAddress } from 'viem/utils'
import type { Address } from 'viem'

export const WELL_KNOWN_PATH = '/.well-known/tip-router'
export const BPS_DENOMINATOR = 10_000
export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000'

// ---------------------------------------------------------------------------
// Network registry
// ---------------------------------------------------------------------------

export type NormalizeResult = { ok: true; address: string } | { ok: false; reason: 'BAD_CHECKSUM' | 'BAD_ADDRESS' }

export type NetworkSpec = {
  label: string
  /** True when this client can actually send a tip on the network. */
  payable: boolean
  normalize: (raw: string) => NormalizeResult
}

export const NETWORKS = {
  ethereum: {
    label: 'Ethereum',
    payable: true,
    normalize(raw) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) return { ok: false, reason: 'BAD_ADDRESS' }
      // strict: a mixed-case address must carry a valid EIP-55 checksum.
      if (!isAddress(raw, { strict: true })) return { ok: false, reason: 'BAD_CHECKSUM' }
      return { ok: true, address: getAddress(raw) }
    },
  },
  sui: {
    label: 'Sui',
    payable: false,
    normalize(raw) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) return { ok: false, reason: 'BAD_ADDRESS' }
      return { ok: true, address: raw.toLowerCase() }
    },
  },
} as const satisfies Record<string, NetworkSpec>

export type Network = keyof typeof NETWORKS
export const NETWORK_NAMES = Object.keys(NETWORKS) as Network[]

/** The network this client pays on. */
export const PAY_NETWORK: Network = 'ethereum'

export function isNetwork(s: string): s is Network {
  return Object.prototype.hasOwnProperty.call(NETWORKS, s)
}

/** Normalized address per network. */
export type Tipjars = Partial<Record<Network, string>>

/**
 * `<network>:<address>` not glued to surrounding alphanumerics. The network name
 * is filtered against the registry afterwards, so `https:` etc. never match.
 */
export const TIPJAR_RE = /(?<![A-Za-z0-9])([a-z][a-z0-9-]{1,31}):([A-Za-z0-9]{20,128})(?![A-Za-z0-9])/g

// ---------------------------------------------------------------------------
// Types exchanged between worker and client
// ---------------------------------------------------------------------------

export type HostStatus = 'ok' | 'missing' | 'invalid'
export type HostReason =
  | 'not-found'
  | 'fetch-failed'
  | 'bad-json'
  | 'bad-shape'
  | 'bad-version'
  | 'bad-address'
  | 'no-payable-tipjar'
  | 'fee-out-of-range'

export type HostInfo = {
  status: HostStatus
  /** `<origin>/.well-known/tip-router` */
  url: string
  /** Checksummed host tipjar on PAY_NETWORK. null unless status === 'ok'. */
  tipjar: Address | null
  /** Every valid tipjar the host advertises, by network. */
  tipjars: Tipjars
  /** Host share in bps. 0 unless status === 'ok'. */
  feeBps: number
  reason?: HostReason
}

export type ResolveResult = {
  ok: true
  /** Canonical URI. This exact string must be passed to `tip()`. */
  targetURI: string
  origin: string
  /** Network the tip is paid on. */
  network: Network
  /** Checksummed receiver (user) tipjar on `network`. */
  receiver: Address
  /** Every valid tipjar the profile advertises, by network. */
  receiverTipjars: Tipjars
  receiverSource: { url: string; contentType: string | null; candidates: number }
  host: HostInfo
  /** Receiver share passed to `tip()`: 10000 - feeBps, or 10000 when host is not ok. */
  ratioBps: number
  resolvedAt: string
}

export type ResolveErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_SCHEME'
  | 'PRIVATE_HOST'
  | 'FETCH_FAILED'
  | 'UPSTREAM_STATUS'
  | 'TIMEOUT'
  | 'TOO_LARGE'
  | 'NO_TIPJAR'
  | 'BAD_CHECKSUM'

export type ResolveFailure = {
  ok: false
  code: ResolveErrorCode
  message: string
  targetURI?: string
}

export type ResolveResponse = ResolveResult | ResolveFailure

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/** Normalize a user-supplied URL: parse, drop the fragment, return `.href`. Throws on invalid input. */
export function canonicalizeTargetURI(input: string): string {
  const u = new URL(input.trim())
  u.hash = ''
  return u.href
}

export type ExtractResult = {
  /** First valid address per network, in document order. */
  tipjars: Tipjars
  /** Distinct addresses seen per network (to flag ambiguity). */
  candidates: Partial<Record<Network, number>>
  /** Networks whose first declaration was malformed. */
  invalid: Partial<Record<Network, 'BAD_CHECKSUM' | 'BAD_ADDRESS'>>
}

/**
 * Find every `<network>:<address>` declaration in free text. Per network the
 * first occurrence wins (a profile bio precedes posts).
 */
export function extractTipjars(text: string): ExtractResult {
  const tipjars: Tipjars = {}
  const invalid: ExtractResult['invalid'] = {}
  const seen: Partial<Record<Network, Set<string>>> = {}

  for (const m of text.matchAll(TIPJAR_RE)) {
    const name = m[1]
    if (!isNetwork(name)) continue
    const raw = m[2]
    ;(seen[name] ??= new Set()).add(raw.toLowerCase())
    if (tipjars[name] !== undefined || invalid[name] !== undefined) continue
    const n = NETWORKS[name].normalize(raw)
    if (n.ok) tipjars[name] = n.address
    else invalid[name] = n.reason
  }

  const candidates: ExtractResult['candidates'] = {}
  for (const [k, v] of Object.entries(seen)) candidates[k as Network] = v.size
  return { tipjars, candidates, invalid }
}

/** Parse the body of `/.well-known/tip-router`. Never throws. */
export function parseWellKnown(text: string, url: string): HostInfo {
  const invalid = (reason: HostReason, tipjars: Tipjars = {}): HostInfo => ({
    status: 'invalid',
    url,
    tipjar: null,
    tipjars,
    feeBps: 0,
    reason,
  })

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return invalid('bad-json')
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return invalid('bad-shape')
  const obj = json as Record<string, unknown>

  if (obj.version !== 1) return invalid('bad-version')

  const rawTipjars = obj.tipjars
  if (typeof rawTipjars !== 'object' || rawTipjars === null || Array.isArray(rawTipjars)) return invalid('bad-shape')

  const tipjars: Tipjars = {}
  for (const [name, value] of Object.entries(rawTipjars as Record<string, unknown>)) {
    if (!isNetwork(name)) continue // unknown networks are ignored, not fatal
    if (typeof value !== 'string') return invalid('bad-address')
    const n = NETWORKS[name].normalize(value)
    if (!n.ok) return invalid('bad-address')
    if (name === 'ethereum' && n.address === ZERO_ADDRESS) return invalid('bad-address')
    tipjars[name] = n.address
  }

  const feeBps = obj.feeBps
  if (typeof feeBps !== 'number' || !Number.isInteger(feeBps) || feeBps < 0 || feeBps > BPS_DENOMINATOR) {
    return invalid('fee-out-of-range', tipjars)
  }

  const payTipjar = tipjars[PAY_NETWORK]
  if (payTipjar === undefined) return invalid('no-payable-tipjar', tipjars)

  return { status: 'ok', url, tipjar: payTipjar as Address, tipjars, feeBps }
}

export function feeBpsToRatioBps(feeBps: number): number {
  return BPS_DENOMINATOR - feeBps
}

/** Mirrors TipSplitter.tip(): host gets the floored share, receiver gets the rest (dust). */
export function expectedSplit(amount: bigint, ratioBps: number): { receiverAmount: bigint; hostAmount: bigint } {
  const hostAmount = (amount * BigInt(BPS_DENOMINATOR - ratioBps)) / BigInt(BPS_DENOMINATOR)
  return { receiverAmount: amount - hostAmount, hostAmount }
}
