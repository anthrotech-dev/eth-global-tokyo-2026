import { isAddressEqual, keccak256, stringToBytes } from 'viem'
import { ZERO_ADDRESS, canonicalizeTargetURI, expectedSplit, type ResolveResult } from '../../shared/tipRouter.ts'
import type { TippedEvent } from './tip.ts'

export type Check = {
  id: string
  label: string
  pass: boolean
  expected?: string
  actual?: string
}

export type VerificationReport = {
  ok: boolean
  checks: Check[]
  verifiedAt: string
  origin: string
}

/**
 * Verify that an on-chain Tipped event is consistent with what the target URL
 * currently advertises. `fresh` must be a re-resolution of `ev.targetURI`.
 */
export function verifyTip(ev: TippedEvent, fresh: ResolveResult, inputUrl?: string): VerificationReport {
  const checks: Check[] = []

  const hash = keccak256(stringToBytes(ev.targetURI))
  checks.push({
    id: 'uri-hash',
    label: 'targetURIHash == keccak256(targetURI)',
    pass: hash === ev.targetURIHash,
    expected: hash,
    actual: ev.targetURIHash,
  })

  checks.push({
    id: 'uri-canonical',
    label: 'Re-resolved URI matches the tipped URI',
    pass: fresh.targetURI === ev.targetURI,
    expected: fresh.targetURI,
    actual: ev.targetURI,
  })

  if (inputUrl !== undefined) {
    let canonical = ''
    try {
      canonical = canonicalizeTargetURI(inputUrl)
    } catch {
      canonical = '(invalid URL)'
    }
    checks.push({
      id: 'uri-input',
      label: 'Tipped URI matches the URL you entered',
      pass: canonical === ev.targetURI,
      expected: canonical,
      actual: ev.targetURI,
    })
  }

  checks.push({
    id: 'receiver',
    label: 'Receiver == tipjar declared on the profile',
    pass: isAddressEqual(fresh.receiver, ev.receiver),
    expected: fresh.receiver,
    actual: ev.receiver,
  })

  const expectedHost = fresh.host.tipjar ?? ZERO_ADDRESS
  checks.push({
    id: 'host',
    label: 'Host == tipjar declared in /.well-known/tip-router',
    pass: isAddressEqual(expectedHost, ev.host),
    expected: expectedHost,
    actual: ev.host,
  })

  const split = expectedSplit(ev.amount, fresh.ratioBps)
  checks.push({
    id: 'split-ratio',
    label: `Split follows the advertised fee (${fresh.host.feeBps} bps)`,
    pass: split.receiverAmount === ev.receiverAmount && split.hostAmount === ev.hostAmount,
    expected: `${split.receiverAmount} / ${split.hostAmount}`,
    actual: `${ev.receiverAmount} / ${ev.hostAmount}`,
  })

  checks.push({
    id: 'split-sum',
    label: 'receiverAmount + hostAmount == amount',
    pass: ev.receiverAmount + ev.hostAmount === ev.amount,
    expected: ev.amount.toString(),
    actual: (ev.receiverAmount + ev.hostAmount).toString(),
  })

  return { ok: checks.every((c) => c.pass), checks, verifiedAt: new Date().toISOString(), origin: fresh.origin }
}
