import type { Address } from 'viem'
import { BPS_DENOMINATOR, NETWORKS, type Network, type ResolveResult, type Tipjars } from '../../shared/tipRouter.ts'
import { AddressLink } from './AddressLink.tsx'

function hostNote(r: ResolveResult): string {
  switch (r.host.status) {
    case 'ok':
      return `The host advertises a ${r.host.feeBps / 100}% fee at ${r.host.url}.`
    case 'missing':
      return `${r.host.url} was not found. The host has not adopted TipRouter, so 100% goes to the receiver.`
    case 'invalid':
      return `${r.host.url} exists but is not usable (${r.host.reason}). Falling back to 100% for the receiver.`
  }
}

/** Tipjars on networks other than the default one; selectable in the tip form. */
function OtherTipjars({ tipjars, except }: { tipjars: Tipjars; except: Network }) {
  const others = (Object.keys(tipjars) as Network[]).filter((n) => n !== except)
  if (!others.length) return null
  return (
    <div className="hint">
      Also accepts:{' '}
      {others.map((n) => (
        <span key={n}>
          {NETWORKS[n].label} <code className="addr">{tipjars[n]}</code>{' '}
        </span>
      ))}
    </div>
  )
}

/** Explorer link for Ethereum addresses; other networks are shown as plain text. */
function Addr({ network, address }: { network: Network; address: string }) {
  return network === 'ethereum' ? <AddressLink address={address as Address} /> : <code className="addr">{address}</code>
}

export function ResolveCard({ resolved }: { resolved: ResolveResult }) {
  const receiverPct = resolved.ratioBps / 100
  const hostPct = (BPS_DENOMINATOR - resolved.ratioBps) / 100
  return (
    <section className="card">
      <h2>2. Resolved</h2>
      <dl className="kv">
        <dt>targetURI</dt>
        <dd>
          <code>{resolved.targetURI}</code>
        </dd>
        <dt>Network</dt>
        <dd>{NETWORKS[resolved.network].label}</dd>
        <dt>Receiver</dt>
        <dd>
          <Addr network={resolved.network} address={resolved.receiver} />
          {resolved.receiverSource.candidates > 1 && (
            <span className="warn">
              {' '}
              ({resolved.receiverSource.candidates} distinct {resolved.network}: addresses found; using the first)
            </span>
          )}
          <OtherTipjars tipjars={resolved.receiverTipjars} except={resolved.network} />
        </dd>
        <dt>Host</dt>
        <dd>
          {resolved.host.tipjar ? (
            <Addr network={resolved.network} address={resolved.host.tipjar} />
          ) : (
            <em>none (zero address)</em>
          )}
          <div className="hint">{hostNote(resolved)}</div>
          <OtherTipjars tipjars={resolved.host.tipjars} except={resolved.network} />
        </dd>
        <dt>Split</dt>
        <dd>
          receiver {receiverPct}% / host {hostPct}% <span className="hint">(ratioBps = {resolved.ratioBps})</span>
        </dd>
      </dl>
    </section>
  )
}
